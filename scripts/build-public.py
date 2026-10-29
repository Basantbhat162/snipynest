"""Build a release with local source/home paths removed from Rust diagnostics."""
from pathlib import Path
import os
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
env = os.environ.copy()
# Isolate public packaging from development builds and their locks.
target = root / '.cache/public-target'
env['CARGO_TARGET_DIR'] = str(target)
flags = []
# Cargo encoded flags preserve spaces in checkout and user paths.
for source, replacement in [(str(root), '/snipynest'), (str(Path.home()), '/builder')]:
    for spelling in sorted({source, source.replace(chr(92), '/'), source.replace('/', chr(92))}):
        flags.extend(['--remap-path-prefix', spelling + '=' + replacement])
env.pop('RUSTFLAGS', None)
env['CARGO_ENCODED_RUSTFLAGS'] = '\x1f'.join(flags)
pnpm = shutil.which('pnpm')
if not pnpm:
    raise SystemExit('Install pnpm before building.')
subprocess.run([pnpm, 'tauri', 'build'], cwd=root, env=env, check=True)
exe = target / 'release/omnicopy.exe'
data = exe.read_bytes().lower()
for private in [str(root), str(Path.home())]:
    for spelling in {private, private.replace(chr(92), '/'), private.replace('/', chr(92))}:
        for encoding in ['utf-8', 'utf-16le']:
            if spelling.lower().encode(encoding) in data:
                raise SystemExit('Local build path remains in binary; do not publish.')
print('Public build passed local-path check.')
