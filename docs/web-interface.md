# Web interface

[README](../README.md) · [Verification concepts](verification.md) · [Evidence formats](evidence-formats.md) · [Development checks](../CONTRIBUTING.md)

Use the [hosted interface](https://orbirig-evidence-inspector.onrender.com/) to check a recorded command result against a scenario you select, or to reopen and inspect saved JSON evidence. The Python core performs the checks on the server; the browser displays the results and errors. These actions do not execute commands or contact an external target.

JSON is processed on the server. Use synthetic, non-sensitive data in the public demo.

## Verify an observation

1. Choose **Verify observation** and select the scenario describing the expected behaviour.
2. Enter an execution ID, UTC execution time and observation JSON, or choose **Load example**.
3. Choose **Verify observation** to see the recorded values, each check's expected and actual values, and the overall `PASS` or `FAIL`.

**Load example** fills in a sample execution ID, UTC time and observation JSON for the selected scenario. It uses **NOMINAL to SAFE** if none is selected. **Load failing example** does the same with telemetry that disagrees with the recorded post-state, which produces `FAIL`. Choose **Verify observation** to run the checks after loading an example.

An expected command rejection can pass. Invalid input, including a command incompatible with the selected scenario, produces an error rather than a completed `FAIL` result. See [supported scenarios](verification.md#supported-scenarios) and the rules for [execution IDs and timestamps](evidence-formats.md#execution-ids).

![OrbiRig interface showing the verification form and a PASS result](images/orbirig-web-interface.png)

*The interface after verifying the NOMINAL-to-SAFE example.*

## Inspect evidence

Switch to **Inspect evidence**, select the evidence type and paste saved JSON or load an example. Then submit it with the **Inspect evidence** button. **Load example** provides valid evidence. For verified types, **Load failing example** provides valid evidence with a `FAIL` outcome; the sequence example fails continuity while each record passes. For sequences, **Load long sequence** provides 100 records with a `FAIL` outcome, which shows page controls and the failure filter. **Load altered example** provides evidence that is rejected: a repeated field name for an observation, and saved checks that no longer match the data for verified types.

| Type | What inspection shows and checks |
| --- | --- |
| Observation | Reported command, states, acknowledgement and telemetry. Loading validates the observation format; it does not produce a verification outcome. |
| Verified execution | Execution ID and time, selected scenario, observation, checks and outcome. Python recomputes the results and rejects stored mismatches. |
| Verified execution sequence | Overall outcome, ordered member records and continuity checks. Python reconstructs members and recomputes continuity in saved order. |

Inspection is read-only: it does not edit or repair evidence. A saved `FAIL` is accepted when its checks and outcome match the recomputed results.

Sequences show up to 25 compact member summaries per page, with their original member numbers, execution IDs, scenarios and `PASS` or `FAIL` results. Each member's outgoing continuity check shows its original pair of member numbers and result. **Show details** reveals the execution, observation and verification checks for a member, or the connected execution IDs and expected and observed modes for a continuity check. Several members and continuity checks can stay open for comparison; collapsed details are not rendered.

The sequence outcome and totals for members and continuity checks marked `FAIL` cover the complete document. **Show failures and related records** finds members marked `FAIL` and both members of each continuity check marked `FAIL` across the whole sequence. Continuity checks keep their original links, including links to the next page; filtering does not reconnect records. When more than 1 page is needed, page controls appear above and below the records. Changing the page brings the records heading into view and closes all details; changing the filter also closes details and returns to the first page. Switching between verification and inspection keeps the page, filter and open details. Submitting a new inspection returns to the first page with the filter off and all details closed.

If loading an example would replace your edits, the interface asks for confirmation. Choosing **Cancel** in that dialog keeps your current inputs. Reloading an example with exactly the same current inputs keeps a completed result; loading different values clears it and shows the same reminder as editing.

Invalid input errors add a short suggestion of what to check. Python still decides whether input is valid. Completed results and request errors receive keyboard focus and are brought into view. A short status message announces completed verification or inspection. If you move to another control, switch between verification and inspection or open the help dialog while a request is pending, its response does not move focus or scroll the page.

The submission button shows **Verifying…** or **Inspecting…** while a request is pending. After a result, a completion message appears beside the button on wide screens and below it on narrower ones. The button then stays unavailable until an input changes, because the same inputs give the same result. It remains available after a cancelled request, an input error or a request failure. Completion is separate from the verification outcome: both `PASS` and `FAIL` are completed results. Successful inspection confirms that the evidence is valid, meaning its format is correct and any saved results match the recomputed ones. Observation inspection has no verification outcome; for saved verified evidence, the completion message also states the saved `PASS` or `FAIL` outcome, because valid evidence can record a `FAIL`.

Editing any input after a result clears that result and shows an inline reminder to verify or inspect the current values. Restoring the previous text or selection still requires a new request. If a repeated request is cancelled or fails, the next edit shows the reminder again until a new result completes. The reminder is announced once on the first edit without moving focus. Verification and inspection retain their own inputs and states when you switch between them. Empty required fields are reported beside the field without sending a request: verification lists each missing input and focuses the first, and empty or whitespace-only inspection JSON produces **Evidence JSON is required.** and focuses the field.

While either request is pending, **Cancel request** stops waiting in the browser and keeps the current inputs and selection. Focus returns to the submission button so you can edit or retry. Cancellation produces no verification outcome. The server may already have completed the check; late responses from cancelled requests are ignored, including after a retry.

**How it works** provides browser and command-line instructions. Browser guidance covers verification and inspection, with links to the relevant scenario, evidence-format and validation documentation; command-line guidance explains local CLI use and exit codes. **Documentation** beside these controls opens the guide index. Documentation and source links open in a new tab so your current inputs and results stay in place.

Under **In the browser → Verify observation**, **When a command returns no result** illustrates a [response failure after saving state](stateful-target.md#simulate-a-response-failure-after-state-commit). This is a static example from the Python API; the browser does not run the target. It shows why a collection error produces no verification outcome and why confirming the saved state requires a separate check in this controlled example.

## Run locally

Install [Git](https://git-scm.com/downloads), [uv](https://docs.astral.sh/uv/getting-started/installation/) and Node.js 26 LTS. [`.node-version`](../.node-version) pins Node.js 26.13.0. See the [frontend environment](../CONTRIBUTING.md#frontend-environment) for selecting this version and platform requirements. Python 3.12–3.15 is supported; uv selects the local default from [`.python-version`](../.python-version).

From the repository root, check that the active Node.js version matches `.node-version`, then install the locked Python web and frontend dependencies:

```bash
node --version
uv sync --locked --extra web
cd frontend
npm ci
cd ..
```

Start FastAPI and Vite in separate terminals from the repository root. Select the same Node.js version in the Vite terminal as well:

```bash
# Terminal 1
uv run --no-sync python -m uvicorn orbirig.web:app --reload
```

```bash
# Terminal 2
cd frontend
npm run dev
```

Open the URL printed by Vite, normally <http://localhost:5173>. Vite forwards `/api` requests to FastAPI at `127.0.0.1:8000`. To verify the example observation, choose **Load example**, then **Verify observation**.

For the full development environment, checks and browser-test setup, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Serve a production build locally

After installing dependencies, build the frontend before starting FastAPI:

```bash
cd frontend
npm run build
cd ..
# Start after the build so FastAPI registers the page and asset routes.
uv run --no-sync python -m uvicorn orbirig.web:app
```

Open <http://127.0.0.1:8000>. The build writes assets to the ignored `src/orbirig/static` directory. Python wheels and source distributions do not bundle those assets, so the complete interface requires this checkout-based build.

FastAPI checks for `index.html` and the `assets` directory at startup. If either is missing, the API remains available and frontend URLs return `404`. A missing favicon returns `404` for `/favicon.png` without preventing the interface from loading. After rebuilding the frontend, restart FastAPI to serve the new files.

The build uses [Vite 8's default browser targets](https://v8.vite.dev/guide/build#browser-compatibility): Chrome/Edge 111, Firefox 114 and Safari 16.4. These settings control generated code. Automated browser coverage and its limits are described in [Browser tests](../CONTRIBUTING.md#browser-tests).

## HTTP API

All 4 endpoints use `POST`:

| Endpoint | Request content type | Body |
| --- | --- | --- |
| `/api/verify/observation` | `application/json` | An object containing exactly the 4 string fields `execution_id`, `executed_at`, `scenario_id` and `observation_evidence` |
| `/api/inspect/observation` | `text/plain; charset=utf-8` | Raw observation-evidence JSON text |
| `/api/inspect/verified-execution` | `text/plain; charset=utf-8` | Raw verified-execution JSON text |
| `/api/inspect/verified-execution-sequence` | `text/plain; charset=utf-8` | Raw verified-sequence JSON text |

Request bodies must be UTF-8 without a byte-order mark (BOM). A verification request in another encoding, or with bytes that are not valid UTF-8, returns HTTP `422` with the `invalid_request` code.

For verification, `scenario_id` is one of the [scenario string values](verification.md#supported-scenarios). `observation_evidence` contains JSON as a string, not a nested object. FastAPI passes this string unchanged to `deserialize_execution_evidence(...)`, then delegates verification to `build_verified_execution_record(...)`.

For inspection, FastAPI decodes the submitted text and passes it to the matching evidence reader for validation. For both verification and inspection, the frontend submits the textarea value without parsing and re-serialising it, preserving duplicate keys for server-side rejection. The browser displays Python's results rather than defining its own verification rules.

### Send an example request

With FastAPI running locally, run this command from the repository root:

```bash
curl --header 'Content-Type: application/json' \
  --data-binary @docs/examples/verify-observation-request.json \
  http://127.0.0.1:8000/api/verify/observation
```

The [request file](examples/verify-observation-request.json) contains all 4 fields, with the observation encoded as a JSON string. The response is HTTP `200` with 4 passing checks and `"outcome": "PASS"`; see the [complete response](examples/verify-observation-response.json).

Inspection sends the evidence text directly, without a JSON wrapper:

```bash
# Send the file bytes unchanged, preserving whitespace and repeated JSON fields.
curl --header 'Content-Type: text/plain; charset=utf-8' \
  --data-binary @docs/examples/verified-execution.json \
  http://127.0.0.1:8000/api/inspect/verified-execution
```

### Responses

Successful responses contain data for display and are not saved evidence documents. To create versioned evidence that can be reopened by the evidence readers, use the CLI or the Python serialisation functions.

| HTTP status | Meaning |
| --- | --- |
| `200` | Completed verification or successful inspection. Both allow `FAIL` outcomes; observation inspection has no verification outcome. |
| `400` | An inspection body is not valid UTF-8. |
| `413` | The request body exceeds the size limit below. |
| `415` | The request content type is unsupported. |
| `422` | A verification request or submitted evidence is invalid. |
| `500` | An unexpected server error, separate from verification `FAIL`. |

For HTTP `422` verification errors, `detail` contains a `code` and `message`. For example, selecting `safe_to_nominal_mode` for the example command, which requests `SAFE`, returns:

```json
{
  "detail": {
    "code": "scenario_command_mismatch",
    "message": "observation command does not match the selected scenario"
  }
}
```

Invalid inspection evidence returns a string in `detail`, such as `"verified execution evidence is invalid"`.

### Request size limit

Each endpoint limits the complete body to **4 MiB (4,194,304 bytes), inclusive**. Verification counts the encoded JSON wrapper and embedded evidence string. Inspection counts the submitted UTF-8 bytes. This HTTP limit does not apply to the Python evidence APIs.

Content-type checks run before body-size checks. The server enforces the size limit while reading, regardless of `Content-Length`. After an oversized request, the interface keeps entered values and selections and explains how to reduce the data before resubmitting.

## Render deployment configuration

[`render.yaml`](../render.yaml) declares a Python web service built from `main`, using uv `0.13.4`, `npm ci` and a frontend build. It sets `PYTHON_VERSION=3.12.16`, uses `/` for its health check and declares `autoDeployTrigger: checksPass`.

Render's [native Python runtime also provides Node.js and npm](https://render.com/docs/native-runtimes#tools-and-utilities) for building the frontend. The Blueprint sets `NODE_VERSION=26.13.0` for these build tools. This [setting takes precedence](https://render.com/docs/node-version) over the root `.node-version`; keep the two values aligned. Confirm the applied setting and selected Node.js version in the service's build logs after a Blueprint sync.

The Python installation uses `uv sync --locked` with only the `web` extra and no default dependency groups. A missing or out-of-date `uv.lock` fails the build rather than being updated. OrbiRig is installed in editable mode in `.venv`, so it can serve the assets subsequently built into `src/orbirig/static`. The start command runs `.venv/bin/python` directly, using the installed environment without resolving dependencies again.

When applied, Render's [`PYTHON_VERSION` setting takes precedence](https://render.com/docs/python-version) over `.python-version`. The sync command explicitly selects that version and disables Python downloads by uv: Render must provide the declared interpreter. Changing the local development default does not change this runtime selection. Render provides uv when a root-level `uv.lock` is present; [`UV_VERSION`](https://render.com/docs/uv-version) pins its version.

Check the service's applied settings and deployed commit separately from this declaration. The lock pins the selected Python application dependencies, with the [build-dependency and platform limitations](../CONTRIBUTING.md#python-environment) described in the development guide.
