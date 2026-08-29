"""HTTP boundary for OrbiRig evidence inspection and verification."""

from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from orbirig.evidence import (
    _StrictJSONError,
    _load_strict_json,
    deserialize_execution_evidence,
    deserialize_verified_execution_evidence,
    deserialize_verified_execution_sequence_evidence,
)
from orbirig.models import (
    CommandExecutionObservation,
    InvalidExecutionMetadataError,
    InvariantValue,
    OperatingMode,
    ScenarioCommandMismatchError,
    ScenarioId,
    VerifiedExecutionRecord,
    VerifiedExecutionSequence,
)
from orbirig.verification import build_verified_execution_record


app = FastAPI()
_STATIC_DIRECTORY = Path(__file__).with_name("static")
_VERIFICATION_REQUEST_FIELDS = frozenset(
    (
        "execution_id",
        "executed_at",
        "scenario_id",
        "observation_evidence",
    ),
)


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


def _verified_execution_sequence_presentation(
    sequence: VerifiedExecutionSequence,
) -> dict[str, object]:
    return {
        "records": [
            _verified_execution_presentation(record)
            for record in sequence.records
        ],
        "continuity_results": [
            {
                "previous_execution_id": result.previous_execution_id,
                "next_execution_id": result.next_execution_id,
                "expected_operating_mode": result.expected_operating_mode.value,
                "observed_operating_mode": result.observed_operating_mode.value,
                "passed": result.passed,
            }
            for result in sequence.continuity_results
        ],
        "outcome": sequence.outcome.value,
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


def _verification_error(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": code, "message": message},
    )


async def _decode_verification_request(
    request: Request,
) -> tuple[str, str, str, str]:
    """Decode the outer request while preserving embedded evidence text."""

    media_type = request.headers.get("content-type", "").split(";", 1)[0]

    if media_type.strip().lower() != "application/json":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "invalid_request",
                "message": "verification requests must use application/json",
            },
        )

    try:
        document = _load_strict_json(
            await request.body(),
            invalid_json_message="verification request JSON is invalid",
        )
    except (UnicodeDecodeError, _StrictJSONError):
        raise _verification_error(
            "invalid_request",
            "verification request JSON is invalid",
        ) from None

    if (
        type(document) is not dict
        or set(document) != _VERIFICATION_REQUEST_FIELDS
    ):
        raise _verification_error(
            "invalid_request",
            "verification request fields are invalid",
        )

    execution_id = document["execution_id"]
    executed_at = document["executed_at"]
    scenario_id = document["scenario_id"]
    observation_evidence = document["observation_evidence"]

    if type(execution_id) is not str or type(executed_at) is not str:
        raise _verification_error(
            "invalid_execution_metadata",
            "execution ID and UTC execution timestamp must be strings",
        )

    if type(scenario_id) is not str:
        raise _verification_error(
            "invalid_scenario",
            "scenario ID must be a supported string value",
        )

    if type(observation_evidence) is not str:
        raise _verification_error(
            "invalid_observation_evidence",
            "observation evidence must be a string",
        )

    return execution_id, executed_at, scenario_id, observation_evidence


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


@app.post("/api/verify/observation")
async def verify_observation_evidence(
    request: Request,
) -> dict[str, object]:
    """Verify submitted observation evidence against an explicit scenario."""

    (
        execution_id,
        serialized_executed_at,
        serialized_scenario_id,
        serialized_observation,
    ) = await _decode_verification_request(request)

    try:
        scenario_id = ScenarioId(serialized_scenario_id)
    except ValueError:
        raise _verification_error(
            "invalid_scenario",
            "scenario ID is unsupported",
        ) from None

    try:
        observation = deserialize_execution_evidence(serialized_observation)
    except ValueError:
        raise _verification_error(
            "invalid_observation_evidence",
            "observation evidence is invalid",
        ) from None

    try:
        executed_at = datetime.fromisoformat(serialized_executed_at)
    except ValueError:
        raise _verification_error(
            "invalid_execution_metadata",
            "execution timestamp must be ISO 8601 UTC",
        ) from None

    try:
        record = build_verified_execution_record(
            execution_id=execution_id,
            executed_at=executed_at,
            scenario_id=scenario_id,
            observation=observation,
        )
    except InvalidExecutionMetadataError:
        raise _verification_error(
            "invalid_execution_metadata",
            "execution ID or UTC execution timestamp is invalid",
        ) from None
    except ScenarioCommandMismatchError:
        raise _verification_error(
            "scenario_command_mismatch",
            "observation command does not match the selected scenario",
        ) from None

    return _verified_execution_presentation(record)


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


@app.post("/api/inspect/verified-execution-sequence")
async def inspect_verified_execution_sequence_evidence(
    request: Request,
) -> dict[str, object]:
    """Present a sequence reconstructed by the strict evidence boundary."""

    serialized = await _decode_text_plain_evidence(request)

    try:
        sequence = deserialize_verified_execution_sequence_evidence(serialized)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="verified execution sequence evidence is invalid",
        ) from None

    return _verified_execution_sequence_presentation(sequence)


if _STATIC_DIRECTORY.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=_STATIC_DIRECTORY / "assets"),
        name="frontend-assets",
    )

    @app.get("/", include_in_schema=False)
    async def serve_frontend() -> FileResponse:
        """Serve the built web interface."""

        return FileResponse(_STATIC_DIRECTORY / "index.html")
