# Contributing and development

[README](README.md) · [Architecture](docs/architecture.md) · [Verification concepts](docs/verification.md) · [Web setup and deployment configuration](docs/web-interface.md)

Use this guide to set up the Python core and web interface, run automated checks and build Python distributions. Keep the verification core usable without the web application. The commands below run from a repository checkout; each section states which directory to use.

## Python environment

OrbiRig supports Python **3.12–3.15**. [`.python-version`](.python-version) selects **3.15** for local development without pinning a patch release. The [Render Blueprint](docs/web-interface.md#render-deployment-configuration) declares its runtime separately.

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then prepare the complete Python development environment from the repository root:

```bash
uv sync --locked --extra test --extra dev --extra web
```

uv selects or downloads the interpreter, creates `.venv` and installs OrbiRig in editable mode. No manual activation is needed. The optional extras are defined in [`pyproject.toml`](pyproject.toml):

| Installation | Purpose |
| --- | --- |
| `uv sync --locked` | Python core and CLI |
| `uv sync --locked --extra web` | Core and FastAPI adapter |
| Full command above | Python tests, development tools and web adapter |

Each sync installs exactly the selected extras and removes dependencies that are no longer selected. Restore the full environment before running all development checks. Commands use `uv run --no-sync` to avoid resolving or synchronising it again. After pulling dependency changes, repeat the appropriate `uv sync --locked` command.

To select another supported interpreter, specify it for both installation and execution:

```bash
uv sync --locked --python 3.12 --extra test --extra dev --extra web
uv run --no-sync --python 3.12 python -m pytest -q
```

An existing `.venv` can keep an older patch of its interpreter. To switch patches, use an exact version such as `--python 3.15.2` with the sync command above, keeping the required extras selected. `.python-version` can remain `3.15`.

[`uv.lock`](uv.lock) records resolved dependencies across the supported Python range and platform conditions. `--locked` rejects an out-of-date lock instead of changing it. The lock does not pin Python patch releases or make installed binaries and behaviour identical across platforms. Isolated build dependencies, including the `setuptools>=68` build requirement, are resolved separately. See [uv's locking and syncing rules](https://docs.astral.sh/uv/concepts/projects/sync/).

## Frontend environment

Use Node.js 22.12 or later within the 22.x series. [`.node-version`](.node-version) selects that series. Install the locked frontend dependencies from the repository root:

```bash
cd frontend
npm ci
cd ..
```

See the [web-interface guide](docs/web-interface.md#run-locally) for running FastAPI and Vite or serving a production build.

## Python checks

From the repository root, with the complete development environment installed:

```bash
uv pip check --python .venv
uv run --no-sync python -m pytest -q
uv run --no-sync python -m behave
uv run --no-sync python -m ruff check .
uv run --no-sync python -m pyright
```

pytest checks reference behaviour and deliberate observation mismatches, including that rejected commands and command-handling errors leave the reference state unchanged. It also checks repeatability, saved evidence, untrusted JSON and integration through the CLI, HTTP API and subprocess collector. Branch coverage spans the complete `orbirig` package and reports missing lines and branches. There is no minimum coverage threshold.

To inspect the assertions behind the main verification claims, start here:

| Property | Tests to inspect |
| --- | --- |
| Scenario expectations detect deliberately incorrect observations | [Invariant checks](tests/test_verification.py) and [verified records](tests/test_verified_execution.py) |
| Saved checks are recomputed; consistent `FAIL` remains valid | [Record reading](tests/test_verified_execution_deserialisation.py) and [sequence evidence](tests/test_sequence_evidence.py) |
| Continuity uses the provided order, including repeated IDs or times | [Sequence verification](tests/test_sequence_verification.py) |
| Collection errors produce no verified record | [Subprocess collection](tests/test_subprocess_collection.py) |
| HTTP requests preserve evidence text and reject oversized bodies | [Observation verification](tests/test_web_observation_verification.py) and [request limits](tests/test_web_request_body_limit.py) |

Behave describes the 3 supported command scenarios in Given/When/Then steps: the starting mode, command and expected result. Use pytest for detailed negative cases instead of duplicating them in Behave.

Pyright checks the package, pytest tests, Behave steps and distribution scripts in standard mode against Python 3.12 language and typing rules, regardless of the development interpreter. CI supplies Node.js 22 for its underlying type checker.

### Distribution checks

```bash
uv run --no-sync python scripts/verify_distributions.py
```

The script builds a wheel and source distribution (sdist), checks metadata and required files, then builds another wheel from the sdist. Each wheel is installed without extras or dependencies in its own temporary environment outside the checkout. The checks confirm the installed version and that imports come from the installed package.

The installed-package checks execute a reference scenario with explicit expected results. They also verify observations that pass or deliberately fail the checks and reopen saved evidence. The real installed `orbirig` command is checked for `PASS` and `FAIL` results and the expected JSON content and formatting. Error cases cover malformed input, invalid UTF-8, unsupported scenarios, file errors and a closed output pipe; help is checked too. Temporary environments and distributions are removed afterwards.

Python distributions include the core and optional web adapter module; the sdist also includes distribution-check scripts. Built React assets under `src/orbirig/static` are excluded. CI runs the distribution check after the frontend build so accidentally bundled assets are detected. The complete browser interface requires the [checkout-based frontend build](docs/web-interface.md#serve-a-production-build-locally).

## Frontend checks

From `frontend/`, after `npm ci`:

```bash
npm run typecheck
npm test
npm run build
```

Vitest and React Testing Library check interface behaviour. Type checking and the production build also check browser tests, startup helpers and Playwright configuration. Browser tests run separately from `npm test`.

The `App.*.test.tsx` files group verification, inspection, guidance, examples, completion feedback and cancellation checks. They all render the real application, sharing [test setup and interaction helpers](frontend/src/test/appTestSupport.tsx). Their [hand-written expected values](frontend/src/test/appFixtures.ts) stay independent of application examples and server responses. See [browser modules](docs/architecture.md#browser-modules) to locate the corresponding implementation.

## Browser tests

Playwright exercises the interface in Chromium, Firefox and WebKit against a real FastAPI backend. If the complete development environment is already installed, skip the sync command below. Otherwise, it installs a browser-test environment with only the `web` extra. From the repository root:

```bash
uv sync --locked --extra web
cd frontend
npm ci
npx playwright install chromium firefox webkit
uv run --no-sync npm run test:e2e
```

On Linux, use `npx playwright install --with-deps chromium firefox webkit` to install system dependencies as well. `uv run --no-sync` finds the project from `frontend/` and puts its Python environment on `PATH`, including for the FastAPI subprocess started by Playwright.

Run 1 engine with `uv run --no-sync npm run test:e2e -- --project=firefox`, substituting `chromium` or `webkit` as needed. The default uses 1 worker, no automatic retries and a 5-minute timeout covering setup and tests across all 3 engines.

### Coverage and limits

Fixtures and expected results are written independently of API responses and `ReferenceSpacecraft`. The tests exercise:

- Accepted commands and expected rejections producing `PASS`, and the same rejected observation producing `FAIL` when the selected scenario expects acceptance.
- Behaviour mismatches showing each check's expected value, actual value and result.
- Malformed JSON and repeated field names producing input errors without verification results.
- The 4 MiB request limit in verification and all 3 inspection types, preservation of inputs and resubmission after reducing data. Verification includes an example whose evidence fits but whose encoded request exceeds the limit.
- Observation inspection without a verification outcome, valid saved `FAIL` records with non-ASCII execution IDs, and rejection of contradictory saved outcomes in records and sequences.
- A sequence failing continuity while every record passes, with supplied order differing from timestamp and execution-ID sorting.

<details>
<summary>Keyboard, cancellation and request-text checks</summary>

- Contextual help closing with Escape while hovered, retaining focus and reopening deliberately; selected controls also use emulated touch.
- Focus and completion announcements after verification or inspection, including repeated submissions, valid saved `FAIL` evidence, input errors and delayed responses after moving to another control, switching between verification and inspection or opening help.
- Cancellation aborting the browser request, preserving inputs and the selected evidence type, restoring focus and allowing a new submission. Held Enter presses must not activate a newly focused request button. Component tests also check late responses and JSON parsing after cancellation, independent verification and inspection requests and aborting pending requests when the application unmounts.
- Confirmation before replacing edited inputs with examples, cancellation preserving inputs, and keyboard navigation of browser and CLI guidance at narrow widths and with enlarged text.

Verification and inspection tests require request text to match the textarea value exactly. Duplicate-key inputs cover LF and CRLF endings. A browser may normalise CRLF to LF when filling the textarea; tests allow that newline conversion in the textarea, then require exact request preservation without parsing, re-serialisation or further normalisation.

</details>

The projects use Playwright browser builds and desktop profiles. Mobile emulation runs in Chromium and WebKit; corresponding Firefox cases are skipped because Playwright does not support mobile emulation there. These checks do not establish compatibility with installed Chrome, Edge, Firefox or Safari applications, physical touch devices or iOS Safari. The suite uses Vite's development server and does not test the deployed site or production bundle.

### Test servers and diagnostics

The runner starts FastAPI at `127.0.0.1:18000` and Vite at `127.0.0.1:15173`, waits for HTTP readiness and stops both after the run, including failed runs. Both ports must be free. A preflight TCP check gives each port a one-second deadline and detects occupied ports even when the process does not answer HTTP. Vite's `e2e` mode forwards `/api` to the test backend and stops if its assigned port is busy. Ordinary development uses backend port `8000`.

On macOS and Linux, `SIGTERM` sent to Playwright uses the same teardown as `SIGINT`. Vitest checks runner shutdown using temporary Node.js servers without Python or installed browsers.

To check repeatability across all 3 engines, use a 15-minute timeout from `frontend/`:

```bash
uv run --no-sync npm run test:e2e -- --repeat-each=3 --global-timeout=900000
```

The HTML report is saved in `frontend/playwright-report/`. Failed tests retain traces, screenshots and videos in `frontend/test-results/`. From `frontend/`, open the report with `npx playwright show-report`.

## GitHub CI

The [Checks workflow](.github/workflows/ci.yml) selects this matrix:

| Trigger | Python versions and operating systems | Total jobs |
| --- | --- | --- |
| Ordinary pull request | Python 3.12–3.15 on Ubuntu; Python 3.12 on macOS and Windows | 10 |
| Pull request from `release/*` | Python 3.12–3.15 on Ubuntu, macOS and Windows | 16 |
| Manual `workflow_dispatch` | Python 3.12–3.15 on Ubuntu, macOS and Windows | 16 |
| Push to `main` | Python 3.12–3.15 on Ubuntu | 8 |

Totals include 3 Ubuntu browser jobs and the final `CI passed` job. Python jobs have a 10-minute timeout, browser jobs 30 minutes and `CI passed` 1 minute. Browser invocations also have Playwright's separate 5-minute timeout.

Python setup uses `check-latest: true` to select the latest available patch in each chosen series. A newer patch is downloaded when the runner's cached version is older.

Python test and browser jobs use uv 0.13.4 and install Python dependencies with `uv sync --locked --no-editable`. uv receives the exact interpreter path from `actions/setup-python`, overriding the local `.python-version`. The `Python 3.12` job selects `test`, `dev` and `web`; compatibility jobs select `test` and `web`; browser jobs select only `web`. Subsequent commands use `uv run --no-sync`.

Every Python test job checks dependency consistency and package imports, then runs the complete pytest suite and Behave scenarios. Compatibility jobs use `--no-cov` to avoid duplicate coverage reports.

The Ubuntu `Python 3.12` job also runs Ruff, Pyright and branch coverage. It type-checks, tests and builds the frontend, checks isolated distributions and verifies that FastAPI serves the built page and favicon.

`Chromium / Ubuntu`, `Firefox / Ubuntu` and `WebKit / Ubuntu` each install Python 3.12, Node.js 22 and the selected browser with system dependencies. They type-check the frontend and browser tests, then run that engine's full E2E suite with 1 worker. Chromium uses the headless shell. These jobs run for every listed trigger, independently of the Python compatibility matrix. One failure does not cancel the others. Available failure diagnostics are uploaded as `<browser>-failure-diagnostics` and retained for 7 days.

`CI passed` waits for the Python 3.12 job, compatibility matrix and browser matrix. Every selected job must succeed; failures, cancellations and skipped jobs make the gate fail. This includes all 4 Ubuntu Python versions on pushes to `main`.

The repository's active [Protect main ruleset](https://github.com/NikolayAir/OrbiRig/rules/20544719) requires pull requests and the `Python 3.12` and `CI passed` checks. Required checks are GitHub settings, separate from the workflow; verify the live rules and the checked commit before merging. The `macos-latest` runner does not establish compatibility with older macOS versions.

## Changing behaviour or dependencies

Keep scenario expectations explicit and independent of the reference test double. Check deliberate mismatches as well as passing examples. Preserve the distinction between completed verification `FAIL`, invalid evidence and collection errors, and preserve supplied sequence order. See [verification concepts](docs/verification.md) and the [evidence reference](docs/evidence-formats.md) for the rules and JSON formats to retain.

Select tests for changed responsibilities and risks, starting with focused checks and broadening when needed. Run frontend tests for interface changes and real browser-to-Python tests when changes affect communication between the browser and Python API. Test installed entry points for packaging or CLI changes.

Update `pyproject.toml` and/or `uv.lock` deliberately. For a targeted update within declared constraints, run `uv lock --upgrade-package <package>`, review the diff, sync and rerun relevant checks. [Dependabot](.github/dependabot.yml) checks `uv`, `npm` and GitHub Actions monthly, with at most 2 open version-update PRs per ecosystem; security-update PR limits are separate.

Update the relevant guide when a public command, user interaction, JSON format or validation rule changes. Keep the README focused on the purpose, first use and links to those details. Before proposing a change, review the diff and run `git diff --check`; describe the behaviour and checks actually run.
