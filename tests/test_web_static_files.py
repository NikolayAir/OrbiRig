"""API startup and optional frontend files are checked independently of a real build."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import orbirig

# Use small example files to check page and asset responses without building the frontend.
INDEX = b'<!doctype html><div id="root"></div><script src="/assets/app.js"></script>'
SCRIPT = b'console.log("frontend fixture");'
FAVICON = b"favicon fixture"


def _load_app(directory: Path, monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    # Each import sees its own temporary build. Reloading the shared web module
    # would change the application and paths used by other HTTP tests.
    assert orbirig.__file__ is not None
    source = Path(orbirig.__file__).with_name("web.py")
    destination = directory / "web.py"
    destination.write_bytes(source.read_bytes())
    spec = importlib.util.spec_from_file_location("_orbirig_static_test_app", destination)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    assert isinstance(module.app, FastAPI)
    return module.app


def _write_frontend(directory: Path, entries: tuple[str, ...]) -> None:
    static = directory / "static"
    static.mkdir()
    if "assets" in entries:
        (static / "assets").mkdir()
        (static / "assets/app.js").write_bytes(SCRIPT)
    if "index.html" in entries:
        (static / "index.html").write_bytes(INDEX)
    if "favicon.png" in entries:
        (static / "favicon.png").write_bytes(FAVICON)


def _assert_api_available(client: TestClient) -> None:
    # A successful import alone does not prove that verification still works.
    observation = {
        "evidence_format_version": 1,
        "command": {"command_type": "SET_OPERATING_MODE", "target_mode": "SAFE"},
        "pre_state": {"operating_mode": "NOMINAL"},
        "acknowledgement": {"accepted": True},
        "post_state": {"operating_mode": "SAFE"},
        "telemetry": {"operating_mode": "SAFE"},
    }
    response = client.post("/api/verify/observation", json={
        "execution_id": "startup-check",
        "executed_at": "2026-10-31T10:00:00Z",
        "scenario_id": "nominal_to_safe_mode",
        "observation_evidence": json.dumps(observation),
    })

    assert response.status_code == 200
    assert response.json()["outcome"] == "PASS"
    assert response.json()["execution"]["execution_id"] == "startup-check"


# None means no static/ directory; () means it exists but has no files.
@pytest.mark.parametrize("entries", [
    None,
    (),
    ("assets",),
    ("index.html", "favicon.png"),
    ("assets", "favicon.png"),
], ids=["no-build", "empty-directory", "assets-only", "missing-assets", "missing-index"])
def test_missing_or_incomplete_frontend_keeps_api_available(tmp_path, monkeypatch, entries):
    if entries is not None:
        _write_frontend(tmp_path, entries)

    with TestClient(_load_app(tmp_path, monkeypatch), raise_server_exceptions=False) as client:
        _assert_api_available(client)
        for url in ("/", "/favicon.png", "/assets/app.js"):
            assert client.get(url).status_code == 404


def test_complete_frontend_serves_files_and_keeps_api_available(tmp_path, monkeypatch):
    _write_frontend(tmp_path, ("assets", "index.html", "favicon.png"))

    with TestClient(_load_app(tmp_path, monkeypatch)) as client:
        _assert_api_available(client)
        page = client.get("/")
        assert page.status_code == 200
        assert page.content == INDEX
        assert page.headers["content-type"].startswith("text/html")
        script = client.get("/assets/app.js")
        assert script.status_code == 200
        assert script.content == SCRIPT
        favicon = client.get("/favicon.png")
        assert favicon.status_code == 200
        assert favicon.content == FAVICON
        assert favicon.headers["content-type"] == "image/png"


def test_missing_favicon_keeps_page_assets_and_api_available(tmp_path, monkeypatch):
    _write_frontend(tmp_path, ("assets", "index.html"))

    with TestClient(_load_app(tmp_path, monkeypatch), raise_server_exceptions=False) as client:
        _assert_api_available(client)
        assert client.get("/").status_code == 200
        assert client.get("/assets/app.js").status_code == 200
        assert client.get("/favicon.png").status_code == 404
