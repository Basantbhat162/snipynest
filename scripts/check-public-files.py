"""Check the Git index for accidental private/runtime content (not a full secret scanner)."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
blocked = {'.agents', '.cache', 'Python', 'tmp', 'node_modules', 'target', 'artifacts', 'data', 'blobs', 'drops', '__pycache__'}
patterns = [
    ('private Windows user path', re.compile(rb'[A-Za-z]:[\\/]Users[\\/][^\\/\s]+', re.I)),
    ('private Unix home path', re.compile(rb'/(?:home|Users)/[a-zA-Z0-9_.-]+/')),
    ('private key', re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')),
    ('GitHub credential', re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})')),
    ('AWS credential', re.compile(rb'AKIA[0-9A-Z]{16}')),
    ('API credential', re.compile(rb'sk-[A-Za-z0-9_-]{32,}')),
]
errors = []
for name in filter(None, paths):
    p = Path(name)
    if blocked.intersection(p.parts) or p.name.startswith('.env') or p.suffix.lower() in {'.db', '.sqlite', '.pem', '.pfx', '.dmp'}:
        errors.append((name, 'excluded local data or runtime'))
    data = subprocess.check_output(['git', 'show', ':' + name], cwd=ROOT)
    if len(data) > 5 * 1024 * 1024:
        errors.append((name, 'oversized source file'))
    if b'\0' not in data:
        for label, pattern in patterns:
            if pattern.search(data):
                errors.append((name, label))
for name, label in errors:
    print(name + ': ' + label)
print(f'Inspected {len(list(filter(None, paths)))} indexed files; {len(errors)} findings. Review manually as well.')
sys.exit(bool(errors))
