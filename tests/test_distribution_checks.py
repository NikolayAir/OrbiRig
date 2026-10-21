"""Faults that the distribution gate must reject without running the build tools."""

import base64
import csv
import hashlib
import io
import runpy
import subprocess
import sys
import tarfile
import tomllib
import zipfile
from configparser import Error as ConfigParserError
from pathlib import Path

import pytest

CHECKOUT = Path(__file__).resolve().parents[1]
CHECKS = runpy.run_path(str(CHECKOUT / "scripts/verify_distributions.py"))
PROJECT = tomllib.loads((CHECKOUT / "pyproject.toml").read_text())["project"]
INFO = f"orbirig-{PROJECT['version']}.dist-info/"
RECORD = INFO + "RECORD"


def write_record_rows(files, rows):
    stream = io.StringIO(newline="")
    csv.writer(stream).writerows(rows)
    files[RECORD] = stream.getvalue().encode("utf-8")


def write_record(files, algorithm="sha256"):
    """Produce a standard manifest independently of the checker under test."""
    rows = []
    for name, data in sorted(files.items()):
        if name in {RECORD, INFO + "RECORD.jws", INFO + "RECORD.p7s"}:
            continue
        digest = base64.urlsafe_b64encode(hashlib.new(algorithm, data).digest()).rstrip(b"=")
        rows.append([name, f"{algorithm}={digest.decode('ascii')}", str(len(data))])
    rows.append([RECORD, "", ""])
    write_record_rows(files, rows)


@pytest.fixture
def wheel_files():
    info = f"orbirig-{PROJECT['version']}.dist-info/"
    metadata = [
        "Metadata-Version: 2.4",
        "Name: orbirig",
        f"Version: {PROJECT['version']}",
        f"Requires-Python: {PROJECT['requires-python']}",
    ]
    for extra, requirements in PROJECT["optional-dependencies"].items():
        metadata.append(f"Provides-Extra: {extra}")
        metadata.extend(
            f'Requires-Dist: {requirement}; extra == "{extra}"'
            for requirement in requirements
        )
    files = {
        **{name: b'"""Package module."""' for name in CHECKS["PACKAGE_FILES"]},
        info + "METADATA": ("\n".join(metadata) + "\n").encode(),
        info + "WHEEL": b"Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
        info + "entry_points.txt": b"[console_scripts]\norbirig = orbirig.cli:main\n",
        info + "licenses/LICENSE": b"MIT licence",
    }
    write_record(files)
    return files


@pytest.fixture
def record_rows(wheel_files):
    return list(csv.reader(io.StringIO(wheel_files[RECORD].decode("utf-8"), newline="")))


def write_wheel(tmp_path, files):
    path = tmp_path / "orbirig.whl"
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return path


def test_wheel_checker_accepts_complete_core(wheel_files, tmp_path):
    checked = CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)
    assert set(checked) == CHECKS["PACKAGE_FILES"]


@pytest.mark.parametrize("name", [
    "unexpected_package/__init__.py",
    f"orbirig-{PROJECT['version']}.data/purelib/unexpected_package/__init__.py",
    f"orbirig-{PROJECT['version']}.data/scripts/helper",
    f"orbirig-{PROJECT['version']}.data/data/resource.txt",
])
def test_wheel_comparison_includes_all_installable_files(wheel_files, tmp_path, name):
    rebuilt = CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)
    wheel_files[name] = b"Unexpected installed file"
    write_record(wheel_files)
    direct = CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)
    assert name in direct and name not in rebuilt
    assert direct != rebuilt


def test_wheel_comparison_allows_generated_metadata_differences(wheel_files, tmp_path):
    direct = CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)
    wheel_files[INFO + "WHEEL"] += b"Generator: another backend version\n"
    wheel_files[INFO + "METADATA"] += b"Summary: Another description\n"
    write_record(wheel_files)
    rebuilt = CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)
    assert direct == rebuilt


@pytest.mark.parametrize(("content", "message"), [
    (None, "Missing wheel entry points"),
    (b"", "Missing wheel entry points"),
    (b"[console_scripts]\n", "Incorrect console entry points"),
    (b"[console_scripts]\norbirig = orbirig.web:app\n", "Incorrect console entry points"),
    (b"[console_scripts]\nOrbiRig = orbirig.cli:main\n", "Incorrect console entry points"),
    (
        b"[console_scripts]\norbirig = orbirig.cli:main\nextra = orbirig.cli:main\n",
        "Incorrect console entry points",
    ),
    (b"[gui_scripts]\norbirig = orbirig.cli:main\n", "Incorrect entry-point groups"),
    (
        b"[DEFAULT]\norbirig = orbirig.cli:main\n[console_scripts]\n",
        "Unexpected entry-point defaults",
    ),
    (b"[console_scripts]\norbirig = first\norbirig = orbirig.cli:main\n", "already exists"),
    (b"not an entry-point document", "no section headers"),
    (b"\xff", "invalid start byte"),
], ids=[
    "missing", "empty", "missing-command", "wrong-target", "wrong-case",
    "extra-command", "wrong-group", "defaults", "duplicate", "malformed", "invalid-utf8",
])
def test_wheel_checker_rejects_incorrect_entry_points(wheel_files, tmp_path, content, message):
    name = INFO + "entry_points.txt"
    if content is None:
        del wheel_files[name]
    else:
        wheel_files[name] = content
    write_record(wheel_files)
    with pytest.raises((AssertionError, ConfigParserError, UnicodeDecodeError), match=message):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("name", ["orbirig/models.py", INFO + "METADATA"])
def test_wheel_checker_rejects_duplicate_zip_entries(wheel_files, tmp_path, name):
    path = write_wheel(tmp_path, wheel_files)
    with zipfile.ZipFile(path, "a") as archive, pytest.warns(UserWarning, match="Duplicate name"):
        archive.writestr(name, wheel_files[name])
    with pytest.raises(AssertionError, match="Duplicate wheel ZIP entry"):
        CHECKS["check_wheel"](path, PROJECT)


def test_wheel_checker_ignores_directory_entries(wheel_files, tmp_path):
    path = write_wheel(tmp_path, wheel_files)
    with zipfile.ZipFile(path, "a") as archive:
        archive.writestr("orbirig/", b"")
    CHECKS["check_wheel"](path, PROJECT)


def test_record_checker_accepts_independent_sha256_vector():
    CHECKS["check_record"]({
        "sample.py": b"abc",
        "sample.dist-info/RECORD": (
            b"sample.py,sha256=ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0,3\n"
            b"sample.dist-info/RECORD,,\n"
        ),
    }, "sample.dist-info/")


@pytest.mark.parametrize("algorithm", [
    "sha256", "sha384", "sha512", "sha3_256", "sha3_384", "sha3_512", "blake2b", "blake2s",
])
def test_record_accepts_portable_strong_hashes(wheel_files, tmp_path, algorithm):
    write_record(wheel_files, algorithm)
    CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("algorithm", [
    "md5", "sha1", "sha224", "sha3_224", "shake_128", "shake_256", "unknown",
])
def test_record_rejects_weak_or_unsupported_hashes(wheel_files, record_rows, tmp_path, algorithm):
    record_rows[0][1] = f"{algorithm}=unused"
    write_record_rows(wheel_files, record_rows)
    with pytest.raises(AssertionError, match="Unsupported wheel RECORD hash algorithm"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_record_rejects_incorrect_hash(wheel_files, record_rows, tmp_path):
    next(row for row in record_rows if row[0] == "orbirig/models.py")[1] = "sha256=" + "A" * 43
    write_record_rows(wheel_files, record_rows)
    with pytest.raises(AssertionError, match="Incorrect wheel RECORD hash: orbirig/models.py"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("size", ["999999", "-1", "1.0", "size"])
def test_record_rejects_incorrect_size(wheel_files, record_rows, tmp_path, size):
    record_rows[0][2] = size
    write_record_rows(wheel_files, record_rows)
    with pytest.raises(AssertionError, match="Incorrect wheel RECORD size"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("name", ["orbirig/models.py", RECORD])
@pytest.mark.parametrize("mutation", ["missing", "repeated"])
def test_record_requires_exactly_one_entry_per_file(wheel_files, record_rows, tmp_path, name, mutation):
    row = next(row for row in record_rows if row[0] == name)
    if mutation == "missing":
        record_rows.remove(row)
    else:
        record_rows.append(row)
    write_record_rows(wheel_files, record_rows)
    message = "Incomplete wheel RECORD" if mutation == "missing" else "Duplicate wheel RECORD entry"
    with pytest.raises(AssertionError, match=message):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_record_rejects_nonexistent_file(wheel_files, record_rows, tmp_path):
    record_rows.append(["absent.py", "", ""])
    write_record_rows(wheel_files, record_rows)
    with pytest.raises(AssertionError, match="Unexpected wheel RECORD entry: absent.py"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("row", [b"name\n", b"name,hash\n", b"name,hash,1,extra\n", b"\n"])
def test_record_requires_three_csv_fields(wheel_files, tmp_path, row):
    wheel_files[RECORD] = row
    with pytest.raises(AssertionError, match="expected three fields"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_record_rejects_malformed_csv(wheel_files, tmp_path):
    wheel_files[RECORD] = b'"unterminated,,\n'
    with pytest.raises(csv.Error):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_record_requires_hashes_except_for_itself(wheel_files, record_rows, tmp_path):
    record_rows[0][1] = ""
    write_record_rows(wheel_files, record_rows)
    with pytest.raises(AssertionError, match="Unsupported wheel RECORD hash algorithm"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_record_cannot_hash_itself(wheel_files, record_rows, tmp_path):
    record_rows[-1][1] = "sha256=" + "A" * 43
    write_record_rows(wheel_files, record_rows)
    with pytest.raises(AssertionError, match="must not hash itself"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_record_accepts_omitted_sizes(wheel_files, record_rows, tmp_path):
    for row in record_rows:
        row[2] = ""
    write_record_rows(wheel_files, record_rows)
    CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("suffix", ["jws", "p7s"])
@pytest.mark.parametrize("listed", [False, True])
def test_record_signature_exceptions(wheel_files, record_rows, tmp_path, suffix, listed):
    name = INFO + "RECORD." + suffix
    wheel_files[name] = b"Legacy signature"
    if listed:
        record_rows.append([name, "", ""])
        write_record_rows(wheel_files, record_rows)
        with pytest.raises(AssertionError, match="Unexpected wheel RECORD entry"):
            CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)
    else:
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_record_does_not_exempt_other_signature_paths(wheel_files, tmp_path):
    wheel_files["unexpected_package/RECORD.jws"] = b"Unlisted payload"
    with pytest.raises(AssertionError, match="Incomplete wheel RECORD"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("newline", ["\n", "\r\n"])
def test_record_accepts_utf8_quoted_paths(wheel_files, tmp_path, newline):
    name = f'orbirig-{PROJECT["version"]}.data/data/café,"quoted".txt'
    wheel_files[name] = b"Resource"
    write_record(wheel_files)
    wheel_files[RECORD] = wheel_files[RECORD].replace(b"\r\n", newline.encode())
    assert CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)[name] == b"Resource"


@pytest.mark.parametrize("name", sorted(CHECKS["PACKAGE_FILES"]))
@pytest.mark.parametrize("empty", [False, True], ids=["missing", "empty"])
def test_wheel_checker_rejects_missing_or_empty_modules(wheel_files, tmp_path, name, empty):
    if empty:
        wheel_files[name] = b""
    else:
        del wheel_files[name]
    with pytest.raises(AssertionError, match="Missing or empty package file"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        (b"Name: orbirig", b"Name: another", "Incorrect Name"),
        (f"Version: {PROJECT['version']}".encode(), b"Version: 999", "Incorrect Version"),
        (b"Requires-Python:", b"Wrong-Field:", "Incorrect Requires-Python"),
        (b'; extra == "web"', b"", "Unexpected core dependency"),
    ],
)
def test_wheel_checker_rejects_incorrect_metadata(wheel_files, tmp_path, old, new, message):
    name = f"orbirig-{PROJECT['version']}.dist-info/METADATA"
    wheel_files[name] = wheel_files[name].replace(old, new)
    with pytest.raises(AssertionError, match=message):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize(
    "header",
    [
        b"",
        b"Metadata-Version: \n",
        b"Metadata-Version: current\n",
        b"Metadata-Version: 2.4\nMetadata-Version: 2.4\n",
    ],
    ids=["missing", "empty", "malformed", "repeated"],
)
def test_wheel_checker_requires_metadata_version(wheel_files, tmp_path, header):
    name = f"orbirig-{PROJECT['version']}.dist-info/METADATA"
    wheel_files[name] = wheel_files[name].replace(b"Metadata-Version: 2.4\n", header)
    with pytest.raises(AssertionError, match="Incorrect Metadata-Version"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("version", ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"])
def test_metadata_accepts_supported_versions(wheel_files, tmp_path, version):
    name = INFO + "METADATA"
    wheel_files[name] = wheel_files[name].replace(b"Metadata-Version: 2.4", f"Metadata-Version: {version}".encode())
    write_record(wheel_files)
    CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("version", ["2.7", "2.99"])
def test_metadata_warns_but_accepts_new_minor_versions(wheel_files, tmp_path, version):
    name = INFO + "METADATA"
    wheel_files[name] = wheel_files[name].replace(b"Metadata-Version: 2.4", f"Metadata-Version: {version}".encode())
    write_record(wheel_files)
    with pytest.warns(UserWarning, match="newer than 2.6"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("version", ["0.0", "1.1", "1.2", "2.0", "3.0", "99.0"])
def test_metadata_rejects_unsupported_versions(wheel_files, tmp_path, version):
    name = INFO + "METADATA"
    wheel_files[name] = wheel_files[name].replace(b"Metadata-Version: 2.4", f"Metadata-Version: {version}".encode())
    write_record(wheel_files)
    with pytest.raises(AssertionError, match="Unsupported Metadata-Version"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.mark.parametrize("mutation", ["missing", "wrong-extra", "wrong-constraint", "repeated"])
def test_wheel_checker_requires_complete_optional_dependencies(wheel_files, tmp_path, mutation):
    name = f"orbirig-{PROJECT['version']}.dist-info/METADATA"
    original = next(
        line for line in wheel_files[name].splitlines(keepends=True)
        if line.startswith(b"Requires-Dist: uvicorn")
    )
    replacement = {
        "missing": b"",
        "wrong-extra": original.replace(b'extra == "web"', b'extra == "dev"'),
        "wrong-constraint": original.replace(b";", b",!=0;", 1),
        "repeated": original * 2,
    }[mutation]
    assert replacement != original
    wheel_files[name] = wheel_files[name].replace(original, replacement)
    with pytest.raises(AssertionError, match="Optional dependency metadata differs"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_wheel_checker_rejects_undeclared_optional_dependency(wheel_files, tmp_path):
    name = f"orbirig-{PROJECT['version']}.dist-info/METADATA"
    wheel_files[name] += b'Requires-Dist: another>=1; extra == "web"\n'
    with pytest.raises(AssertionError, match="Optional dependency metadata differs"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_wheel_checker_accepts_requirement_formatting_differences(wheel_files, tmp_path):
    name = f"orbirig-{PROJECT['version']}.dist-info/METADATA"
    original = next(
        line for line in wheel_files[name].splitlines(keepends=True)
        if line.startswith(b"Requires-Dist: pytest-cov")
    )
    dependency, _, marker = original.partition(b";")
    specifiers = dependency.removeprefix(b"Requires-Dist: pytest-cov").strip().split(b",")
    replacement = b"Requires-Dist: Pytest_Cov " + b", ".join(reversed(specifiers)) + b";" + marker
    assert replacement != original
    wheel_files[name] = wheel_files[name].replace(original, replacement)
    write_record(wheel_files)
    CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


def test_wheel_checker_rejects_bundled_frontend(wheel_files, tmp_path):
    wheel_files["orbirig/static/assets/app.js"] = b"frontend"
    with pytest.raises(AssertionError, match="frontend assets"):
        CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)


@pytest.fixture
def sdist_files(wheel_files):
    files = {f"src/{name}": wheel_files[name] for name in CHECKS["PACKAGE_FILES"]}
    files.update({
        "pyproject.toml": (CHECKOUT / "pyproject.toml").read_bytes(),
        "README.md": b"Documentation",
        "LICENSE": b"MIT licence",
        "scripts/verify_distributions.py": b"Build checker",
        "scripts/check_installed_core.py": b"Installed core checker",
        "PKG-INFO": wheel_files[f"orbirig-{PROJECT['version']}.dist-info/METADATA"],
    })
    return files


def write_sdist(tmp_path, files):
    prefix = f"orbirig-{PROJECT['version']}/"
    path = tmp_path / "orbirig.tar.gz"
    with tarfile.open(path, "w:gz") as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(prefix + name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    return path


def test_sdist_checker_accepts_complete_build_inputs(sdist_files, tmp_path):
    CHECKS["check_sdist"](write_sdist(tmp_path, sdist_files), PROJECT)


@pytest.mark.parametrize("missing", [
    "src/orbirig/evidence.py", "src/orbirig/cli.py", "pyproject.toml", "LICENSE",
    "scripts/verify_distributions.py", "scripts/check_installed_core.py",
])
def test_sdist_checker_rejects_missing_build_inputs(sdist_files, tmp_path, missing):
    del sdist_files[missing]
    with pytest.raises(AssertionError, match="Missing"):
        CHECKS["check_sdist"](write_sdist(tmp_path, sdist_files), PROJECT)


def test_sdist_checker_rejects_bundled_frontend(sdist_files, tmp_path):
    sdist_files["src/orbirig/static/index.html"] = b"frontend"
    with pytest.raises(AssertionError, match="frontend assets"):
        CHECKS["check_sdist"](write_sdist(tmp_path, sdist_files), PROJECT)


@pytest.mark.parametrize("script", ["verify_distributions.py", "check_installed_core.py"])
def test_distribution_checks_cannot_silently_disable_assertions(script):
    result = subprocess.run(
        [sys.executable, "-I", "-O", str(CHECKOUT / "scripts" / script)],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "require Python assertions" in result.stderr
