"""HTTP boundary for read-only inspection of OrbiRig evidence."""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from orbirig.evidence import (
    deserialize_execution_evidence,
    deserialize_verified_execution_evidence,
)
from orbirig.models import (
    CommandExecutionObservation,
    InvariantValue,
    OperatingMode,
    VerifiedExecutionRecord,
)


app = FastAPI()
_STATIC_DIRECTORY = Path(__file__).with_name("static")


def _observation_presentation(
    observation: CommandExecutionObservation,
) -> dict[str, object]:
    """Return presentation data for a reconstructed observation."""

    return {
        "command": {
            "command_type": observation.command.command_type.value,
            "target_mode": observation.command.target_mode.value,
        },
        "pre_state": {
            "operating_mode": observation.pre_state.operating_mode.value,
        },
        "acknowledgement": {
            "accepted": observation.acknowledgement.accepted,
        },
        "post_state": {
            "operating_mode": observation.post_state.operating_mode.value,
        },
        "telemetry": {
            "operating_mode": observation.telemetry.operating_mode.value,
        },
    }


def _invariant_value_presentation(value: InvariantValue) -> bool | str:
    if isinstance(value, OperatingMode):
        return value.value
    return value


def _verified_execution_presentation(
    record: VerifiedExecutionRecord,
) -> dict[str, object]:
    return {
        "execution": {
            "execution_id": record.execution_id,
            "executed_at": record.executed_at.isoformat().replace("+00:00", "Z"),
            "scenario_id": record.scenario_id.value,
        },
        "observation": _observation_presentation(record.observation),
        "invariant_results": [
            {
                "invariant_id": result.invariant_id.value,
                "expected": _invariant_value_presentation(result.expected),
                "actual": _invariant_value_presentation(result.actual),
                "passed": result.passed,
            }
            for result in record.invariant_results
        ],
        "outcome": record.outcome.value,
    }


async def _decode_text_plain_evidence(request: Request) -> str:
    """Decode evidence without parsing or normalising the submitted document."""

    media_type = request.headers.get("content-type", "").split(";", 1)[0]

    if media_type.strip().lower() != "text/plain":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="only text/plain evidence is supported",
        )

    try:
        return (await request.body()).decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="evidence must be valid UTF-8",
        ) from None


@app.post("/api/inspect/observation")
async def inspect_observation_evidence(
    request: Request,
) -> dict[str, object]:
    """Reconstruct observation evidence without normalising the submitted evidence text."""

    serialized = await _decode_text_plain_evidence(request)

    try:
        observation = deserialize_execution_evidence(serialized)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="observation evidence is invalid",
        ) from None

    return _observation_presentation(observation)


@app.post("/api/inspect/verified-execution")
async def inspect_verified_execution_evidence(
    request: Request,
) -> dict[str, object]:
    """Present a verified execution reconstructed by the strict evidence boundary."""

    serialized = await _decode_text_plain_evidence(request)

    try:
        record = deserialize_verified_execution_evidence(serialized)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="verified execution evidence is invalid",
        ) from None

    return _verified_execution_presentation(record)


if _STATIC_DIRECTORY.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=_STATIC_DIRECTORY / "assets"),
        name="frontend-assets",
    )

    @app.get("/", include_in_schema=False)
    async def serve_frontend() -> FileResponse:
        """Serve the built evidence-inspection interface."""

        return FileResponse(_STATIC_DIRECTORY / "index.html")
