"""Faults that the distribution gate must reject without running the build tools."""

import io
import runpy
import subprocess
import sys
import tarfile
import tomllib
import zipfile
from pathlib import Path

import pytest

CHECKOUT = Path(__file__).resolve().parents[1]
CHECKS = runpy.run_path(str(CHECKOUT / "scripts/verify_distributions.py"))
PROJECT = tomllib.loads((CHECKOUT / "pyproject.toml").read_text())["project"]


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
    return {
        **{name: b'"""Package module."""' for name in CHECKS["PACKAGE_FILES"]},
        info + "METADATA": ("\n".join(metadata) + "\n").encode(),
        info + "WHEEL": b"Root-Is-Purelib: true\nTag: py3-none-any\n",
        info + "RECORD": b"record",
        info + "licenses/LICENSE": b"MIT licence",
    }


def write_wheel(tmp_path, files):
    path = tmp_path / "orbirig.whl"
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return path


def test_wheel_checker_accepts_complete_core(wheel_files, tmp_path):
    checked = CHECKS["check_wheel"](write_wheel(tmp_path, wheel_files), PROJECT)
    assert set(checked) == CHECKS["PACKAGE_FILES"]


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
    "src/orbirig/evidence.py", "pyproject.toml", "LICENSE",
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
