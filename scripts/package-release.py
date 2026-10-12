"""Package already-built desktop and Companion sources; verify copied bytes."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
extension = root / "extension"
assert json.loads((extension / "manifest.json").read_text(encoding="utf-8"))["version"] == version
artifacts = root / "artifacts"
artifacts.mkdir(exist_ok=True)
name = f"SnipyNest_{version}_x64-setup.exe"
source = root / ".cache/public-target/release/bundle/nsis" / name
destination = artifacts / name
shutil.copy2(source, destination)
assert source.read_bytes() == destination.read_bytes(), "Installer copy differs"
files = sorted(p for p in extension.iterdir() if p.is_file() and p.suffix in {".js", ".mjs", ".html", ".css", ".json", ".md"})
notices = [root / 'LICENSE', root / 'THIRD_PARTY_NOTICES.md']
archive = artifacts / f"SnipyNest-Companion-{version}.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in files + notices:
        bundle.write(path, path.name)
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None, "Archive integrity check failed"
    assert set(bundle.namelist()) == {p.name for p in files + notices}
    for path in files + notices:
        assert bundle.read(path.name) == path.read_bytes(), path.name
print(f"Installer: {destination.name}, {destination.stat().st_size:,} bytes; copy verified")
print(f"Companion: {archive.name}, {archive.stat().st_size:,} bytes; {len(files)} source files verified")
print("Included: " + ", ".join(p.name for p in files))

checksums = artifacts / f'SHA256SUMS-{version}.txt'
checksums.write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in [destination, archive]), encoding='utf-8')
print('Wrote', checksums.name)
