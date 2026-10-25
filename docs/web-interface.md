# Web interface

[README](../README.md) · [Verification concepts](verification.md) · [Development checks](../CONTRIBUTING.md)

The [hosted interface](https://orbirig-evidence-inspector.onrender.com/) verifies recorded observations and inspects saved JSON evidence. Both workflows use the Python core on the server. They do not execute spacecraft commands or contact an external target.

## Verify an observation

1. Choose **Verify observation** and select the scenario describing the expected behaviour.
2. Enter an execution ID, UTC execution time and observation JSON, or choose **Load example**.
3. Choose **Verify observation** to see the recorded values, each check's expected and actual values, and the overall `PASS` or `FAIL`.

**Load example** fills the form for the selected scenario, using `NOMINAL_TO_SAFE_MODE` if none is selected. It supplies sample execution metadata and a matching observation; verification still requires the submit action. The interface asks before replacing edited inputs, and cancelling preserves them.

An expected command rejection can pass. Invalid input, including a command incompatible with the selected scenario, produces an error rather than a completed `FAIL` result. See [supported scenarios](verification.md#supported-scenarios) and [execution metadata](evidence-formats.md#execution-ids).

## Inspect evidence

Choose **Inspect evidence**, select its type and paste saved JSON or choose **Load example**. Then choose **Inspect evidence**.

| Type | What inspection shows and checks |
| --- | --- |
| Observation | Reported command, states, acknowledgement and telemetry. Loading validates the observation format; it does not produce a verification outcome. |
| Verified execution | Execution metadata, selected scenario, observation, checks and outcome. Python recomputes the results and rejects stored mismatches. |
| Verified execution sequence | Overall outcome, ordered member records and continuity checks. Python reconstructs members and recomputes continuity in saved order. |

Examples correspond to the selected evidence type. Inspection accepts canonically consistent `FAIL` records and sequences. It is read-only: it does not edit or repair evidence.

**How it works** provides browser and command-line instructions. Browser guidance covers both workflows; command-line guidance explains local CLI use and exit codes.

## Run locally

Install [Git](https://git-scm.com/downloads), [uv](https://docs.astral.sh/uv/getting-started/installation/) and Node.js 22.12 or later within the 22.x series, selected by [`.node-version`](../.node-version). The Python package supports 3.12–3.15; uv selects the local default from [`.python-version`](../.python-version).

From a checkout, install the locked Python web and frontend dependencies:

```bash
uv sync --locked --extra web
cd frontend
npm ci
cd ..
```

Start FastAPI and Vite in separate terminals from the repository root:

```bash
# Terminal 1
uv run --no-sync python -m uvicorn orbirig.web:app --reload
```

```bash
# Terminal 2
cd frontend
npm run dev
```

Open the URL printed by Vite, normally <http://localhost:5173>. Vite forwards `/api` requests to FastAPI at `127.0.0.1:8000`. To try the initial workflow, choose **Load example**, then **Verify observation**.

For development checks and browser-test setup, see [CONTRIBUTING.md](../CONTRIBUTING.md). Each `uv sync` installs the selected extras and removes unselected dependencies; restore the full development environment before running all checks.

## Serve a production build locally

After installing dependencies, build the frontend before starting FastAPI:

```bash
cd frontend
npm run build
cd ..
uv run --no-sync python -m uvicorn orbirig.web:app
```

Open <http://127.0.0.1:8000>. The build writes assets to the ignored `src/orbirig/static` directory. Python wheels and source distributions do not bundle those assets, so the complete interface requires this checkout-based build.

The build uses [Vite 8's default browser targets](https://v8.vite.dev/guide/build#browser-compatibility): Chrome/Edge 111, Firefox 114 and Safari 16.4. These targets control generated code; the [browser-test coverage](../CONTRIBUTING.md#browser-tests) describes the engines and workflows exercised by tests. They are separate from compatibility checks on installed browser applications or physical devices.

## HTTP boundary

All four endpoints use `POST`:

| Endpoint | Request content type | Body |
| --- | --- | --- |
| `/api/verify/observation` | `application/json` | An object containing exactly the four string fields `execution_id`, `executed_at`, `scenario_id` and `observation_evidence` |
| `/api/inspect/observation` | `text/plain; charset=utf-8` | Raw observation-evidence JSON text |
| `/api/inspect/verified-execution` | `text/plain; charset=utf-8` | Raw verified-execution JSON text |
| `/api/inspect/verified-execution-sequence` | `text/plain; charset=utf-8` | Raw verified-sequence JSON text |

For verification, `scenario_id` is one of the [scenario string values](verification.md#supported-scenarios), and `observation_evidence` contains JSON as a string, not a nested JSON object. FastAPI passes this string unchanged to `deserialize_execution_evidence(...)`, then delegates verification to `build_verified_execution_record(...)`.

For inspection, FastAPI decodes the submitted text and passes it to the matching strict evidence reader. In both workflows the frontend submits the textarea value without parsing and re-serialising it, preserving duplicate keys for server-side rejection. The browser displays Python's results rather than defining its own verification rules.

Responses are JSON for presentation, not the versioned evidence documents written by the Python serializers or CLI. Completed verification returns HTTP `200` for either `PASS` or `FAIL`; invalid verification input returns HTTP `422`. Successful inspection returns HTTP `200`, including for consistent saved `FAIL` evidence; invalid evidence returns HTTP `422`, and invalid UTF-8 in an inspection body returns HTTP `400`.

### Request size limit

Each endpoint limits the complete body to **4 MiB (4,194,304 bytes), inclusive**. Verification counts the encoded JSON wrapper and embedded evidence string; inspection counts the submitted UTF-8 bytes. This HTTP limit does not apply to the Python evidence APIs.

Content-type checks run first and return HTTP `415` for unsupported types. The server checks body size while reading, regardless of `Content-Length`, and returns HTTP `413` above the limit. The interface explains the size limit and keeps entered values and selections so the data can be reduced and submitted again.

## Render deployment configuration

[`render.yaml`](../render.yaml) declares a Python web service built from `main`, with a pip install of `.[web]`, `npm ci` and a frontend build. It sets `PYTHON_VERSION=3.12.15`, uses `/` for its health check and declares `autoDeployTrigger: checksPass`.

This is the repository's deployment declaration. A service's applied settings and deployed commit must be checked separately before relying on them. The Blueprint does not use `uv.lock`, so locked local and CI installations do not make the deployed Python environment fully locked. When applied, Render's [`PYTHON_VERSION` setting takes precedence](https://render.com/docs/python-version) over `.python-version`; changing the local development default does not itself migrate that configured runtime.
