"""HTTP boundary for read-only inspection of OrbiRig observation evidence."""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from orbirig.evidence import deserialize_execution_evidence
from orbirig.models import CommandExecutionObservation


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


@app.post("/api/inspect/observation")
async def inspect_observation_evidence(
    request: Request,
) -> dict[str, object]:
    """Reconstruct observation evidence without normalising the submitted evidence text."""

    media_type = request.headers.get("content-type", "").split(";", 1)[0]

    if media_type.strip().lower() != "text/plain":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="only text/plain evidence is supported",
        )

    try:
        serialized = (await request.body()).decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="evidence must be valid UTF-8",
        ) from None

    try:
        observation = deserialize_execution_evidence(serialized)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="observation evidence is invalid",
        ) from None

    return _observation_presentation(observation)


if _STATIC_DIRECTORY.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=_STATIC_DIRECTORY / "assets"),
        name="frontend-assets",
    )

    @app.get("/", include_in_schema=False)
    async def serve_frontend() -> FileResponse:
        """Serve the built observation-inspection interface."""

        return FileResponse(_STATIC_DIRECTORY / "index.html")
