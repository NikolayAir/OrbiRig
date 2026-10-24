"""Build and check Python artefacts, then exercise their isolated installations."""

import base64
import csv
import hashlib
import io
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import warnings
import zipfile
from collections import Counter
from configparser import ConfigParser
from email.message import Message
from email.parser import BytesParser
from pathlib import Path

PACKAGE_FILES = frozenset(
    f"orbirig/{name}.py"
    for name in (
        "__init__",
        "cli",
        "evidence",
        "execution",
        "models",
        "reference_sut",
        "subprocess_collection",
        "verification",
        "web",
        "workflow",
    )
)
# Portable, fixed-length hashes with at least 256-bit digests.
RECORD_HASH_ALGORITHMS = hashlib.algorithms_guaranteed - {
    "md5", "sha1", "sha224", "sha3_224", "shake_128", "shake_256",
}


def normalise_requirement(requirement: str) -> str:
    """Compare this project's simple requirements without a general PEP 508 parser."""
    match = re.fullmatch(
        r"([A-Za-z0-9][A-Za-z0-9._-]*)([<>=!~][^;@\[\]()]+)?",
        "".join(requirement.split()),
    )
    assert match is not None, f"Unsupported requirement form; reassess this check: {requirement}"
    name = re.sub(r"[-_.]+", "-", match[1]).lower()
    specifiers = match[2]
    return name + (",".join(sorted(specifiers.split(","))) if specifiers else "")


def check_metadata(data: bytes, project: dict) -> Message:
    """Check identity, Python support and complete optional dependency metadata."""
    metadata = BytesParser().parsebytes(data)
    versions = metadata.get_all("Metadata-Version", [])
    assert len(versions) == 1 and re.fullmatch(r"[0-9]+\.[0-9]+", versions[0]), (
        "Incorrect Metadata-Version metadata"
    )
    # Provides-Extra needs 2.1. Accept additive 2.x updates; reassess a new major.
    assert re.fullmatch(r"2\.[1-9][0-9]*", versions[0]), (
        f"Unsupported Metadata-Version metadata: {versions[0]}"
    )
    if int(versions[0].split(".")[1]) > 6:
        warnings.warn(
            f"Metadata-Version {versions[0]} is newer than 2.6; checking known fields",
            stacklevel=2,
        )
    for field, value in (("Name", project["name"]), ("Version", project["version"])):
        assert metadata.get_all(field) == [value], f"Incorrect {field} metadata"
    python_requirements = metadata.get_all("Requires-Python", [])
    assert len(python_requirements) == 1, "Incorrect Requires-Python metadata"
    assert sorted(python_requirements[0].split(",")) == sorted(
        project["requires-python"].split(",")
    ), "Incorrect Requires-Python metadata"
    extras = set(project["optional-dependencies"])
    assert set(metadata.get_all("Provides-Extra", [])) == extras
    assert project["dependencies"] == [], "Reassess the dependency-free core check"
    expected = Counter(
        (normalise_requirement(requirement), f'extra == "{extra}"')
        for extra, requirements in project["optional-dependencies"].items()
        for requirement in requirements
    )
    actual = Counter()
    for requirement in metadata.get_all("Requires-Dist", []):
        dependency, _, marker = requirement.partition(";")
        marker = marker.strip()
        assert marker in {
            f'extra == "{extra}"' for extra in extras
        }, f"Unexpected core dependency: {requirement}"
        actual[(normalise_requirement(dependency), marker)] += 1
    assert actual == expected, (
        f"Optional dependency metadata differs: missing {expected - actual}; "
        f"unexpected {actual - expected}"
    )
    return metadata


def check_package_files(files: dict[str, bytes], prefix: str = "") -> None:
    """Keep the required modules explicit so missing source files cannot pass."""
    for name in PACKAGE_FILES:
        assert files.get(prefix + name), f"Missing or empty package file: {name}"
    assert not any(
        name.startswith(prefix + "orbirig/static/") for name in files
    ), "Built frontend assets are outside the Python distribution contract"


def check_record(files: dict[str, bytes], info: str) -> None:
    """Check wheel hashes and sizes, excluding the legacy signature files."""
    record = info + "RECORD"
    assert files.get(record), "Missing wheel RECORD"
    signatures = {info + "RECORD.jws", info + "RECORD.p7s"}
    recorded: set[str] = set()
    for row in csv.reader(io.StringIO(files[record].decode("utf-8"), newline=""), strict=True):
        assert len(row) == 3, "Incorrect wheel RECORD row: expected three fields"
        name, digest, size = row
        assert name not in recorded, f"Duplicate wheel RECORD entry: {name}"
        assert name in files and name not in signatures, f"Unexpected wheel RECORD entry: {name}"
        recorded.add(name)
        if name == record:
            assert not digest, "Wheel RECORD must not hash itself"
        else:
            algorithm, separator, value = digest.partition("=")
            assert separator and algorithm in RECORD_HASH_ALGORITHMS, (
                f"Unsupported wheel RECORD hash algorithm: {algorithm}"
            )
            actual = base64.urlsafe_b64encode(
                hashlib.new(algorithm, files[name]).digest()
            ).rstrip(b"=").decode("ascii")
            assert value == actual, f"Incorrect wheel RECORD hash: {name}"
        # The inherited RECORD format permits omitted sizes, but wheel hashes are mandatory.
        assert not size or (re.fullmatch(r"[0-9]+", size) and int(size) == len(files[name])), (
            f"Incorrect wheel RECORD size: {name}"
        )
    missing = set(files) - signatures - recorded
    assert not missing, f"Incomplete wheel RECORD: missing {sorted(missing)}"


def check_wheel(path: Path, project: dict) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        names = [member.filename for member in members]
        assert len(names) == len(set(names)), "Duplicate wheel ZIP entry"
        files = {
            member.filename: archive.read(member) for member in members if not member.is_dir()
        }
    check_package_files(files)
    info = f"{project['name']}-{project['version']}.dist-info/"
    check_metadata(files[info + "METADATA"], project)
    entry_points_file = info + "entry_points.txt"
    assert files.get(entry_points_file), "Missing wheel entry points"
    entry_points = ConfigParser(interpolation=None)
    entry_points.optionxform = lambda optionstr: optionstr
    entry_points.read_string(files[entry_points_file].decode("utf-8"))
    assert not entry_points.defaults(), "Unexpected entry-point defaults"
    assert entry_points.sections() == ["console_scripts"], "Incorrect entry-point groups"
    assert dict(entry_points["console_scripts"]) == project["scripts"], (
        "Incorrect console entry points"
    )
    check_record(files, info)
    wheel_metadata = BytesParser().parsebytes(files[info + "WHEEL"])
    assert wheel_metadata["Root-Is-Purelib"] == "true"
    assert wheel_metadata.get_all("Tag") == ["py3-none-any"]
    assert any(
        files.get(info + name) for name in ("LICENSE", "licenses/LICENSE")
    ), "Missing wheel licence"
    return {name: data for name, data in files.items() if not name.startswith(info)}


def check_sdist(path: Path, project: dict) -> None:
    with tarfile.open(path) as archive:
        files = {}
        for member in archive.getmembers():
            if member.isfile():
                stream = archive.extractfile(member)
                assert stream is not None
                files[member.name] = stream.read()
    prefix = f"{project['name']}-{project['version']}/"
    check_package_files(files, prefix + "src/")
    for name in (
        "pyproject.toml", "README.md", "LICENSE",
        "scripts/verify_distributions.py", "scripts/check_installed_core.py",
        "tests/fixtures/subprocess_observation_peer.py",
    ):
        assert files.get(prefix + name), f"Missing or empty sdist file: {name}"
    assert tomllib.loads(files[prefix + "pyproject.toml"].decode())["project"] == project
    check_metadata(files[prefix + "PKG-INFO"], project)


def only_artifact(directory: Path, pattern: str) -> Path:
    matches = list(directory.glob(pattern))
    assert len(matches) == 1, f"Expected one {pattern} in {directory}, got {matches}"
    return matches[0]


def main() -> None:
    if not __debug__:
        raise RuntimeError("Distribution checks require Python assertions; do not use -O")
    checkout = Path(__file__).resolve().parents[1]
    project = tomllib.loads((checkout / "pyproject.toml").read_text())["project"]
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    env.pop("VIRTUAL_ENV", None)
    with tempfile.TemporaryDirectory(prefix="orbirig-distributions-") as temporary:
        work = Path(temporary).resolve()
        assert not work.is_relative_to(checkout), "Temporary directory is inside checkout"

        def run(*args: str) -> None:
            subprocess.run(args, cwd=work, env=env, check=True)

        def build(source: Path, output: Path, *formats: str) -> None:
            run(
                "uv", "build", "--no-config", "--python", sys.executable,
                "--no-build-logs", *formats, str(source), "--out-dir", str(output),
            )

        direct = work / "direct"
        build(checkout, direct, "--sdist", "--wheel")
        sdist = only_artifact(direct, "*.tar.gz")
        wheel = only_artifact(direct, "*.whl")
        check_sdist(sdist, project)
        direct_files = check_wheel(wheel, project)

        rebuilt = work / "from-sdist"
        build(sdist, rebuilt, "--wheel")
        rebuilt_wheel = only_artifact(rebuilt, "*.whl")
        assert check_wheel(rebuilt_wheel, project) == direct_files, (
            "Wheel package contents differ when built from sdist"
        )

        for label, artifact in (("direct", wheel), ("from-sdist", rebuilt_wheel)):
            venv = work / f"{label}-venv"
            run("uv", "venv", "--no-config", "--python", sys.executable, str(venv))
            python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
            run(
                "uv", "pip", "install", "--no-config", "--python", str(python),
                "--no-index", "--no-deps", str(artifact),
            )
            run(
                str(python), "-I", str(checkout / "scripts/check_installed_core.py"),
                project["version"], str(checkout), str(artifact),
            )
            print(f"{label}: metadata, contents and isolated core/CLI workflows passed", flush=True)


if __name__ == "__main__":
    main()
