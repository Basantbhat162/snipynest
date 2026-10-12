"""Generate the original SnipyNest public capture cue; no samples or third-party audio."""
from pathlib import Path
import math
import struct
import wave

RATE = 48000
DURATION = 0.54

def generate():
    frames = bytearray()
    for i in range(round(RATE * DURATION)):
        t = i / RATE
        attack = min(1.0, t / 0.003)
        tail = min(1.0, (DURATION - t) / 0.025)
        # A short, soft click followed by a quiet two-tone resonance.
        click = 0.15 * math.exp(-t * 150) * math.sin(2 * math.pi * 1800 * t)
        body = 0.12 * math.exp(-t * 17) * math.sin(2 * math.pi * 740 * t)
        bell = 0.055 * math.exp(-t * 12) * math.sin(2 * math.pi * 1110 * t)
        frames.extend(struct.pack('<h', round(32767 * attack * tail * (click + body + bell))))
    return bytes(frames)

if __name__ == '__main__':
    path = Path(__file__).resolve().parents[1] / 'src-tauri/assets/capture.wav'
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(generate())
    print('Generated original capture cue:', path.name)
