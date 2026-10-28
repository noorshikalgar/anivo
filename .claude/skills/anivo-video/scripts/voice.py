"""Voiceover for an Anivo Script video, with Kokoro (local, free, Apache 2.0).

The narration of a step is its caption, or a `# say: ...` comment line after
the step line (for a step with no caption, for example the title).

  voice.py synth  <script.txt> <dir> [--voice af_heart] [--speed 1.0]
      One WAV for each spoken step in <dir>, and <dir>/lines.json.
  voice.py fit    <script.txt> <scene.anivo> <dir> [--anivo CMD]
      Make each step at least as long as its line + a pause: rewrites hold= in
      the script, applies it to the scene, and repeats until all lines fit.
  voice.py mix    <scene.anivo> <dir> <out.wav> [--anivo CMD]
      One track: each line starts at the start of its step (+ a short lead).

Run synth with the Python that has kokoro (see SKILL.md). fit and mix need
only the standard library and the anivo CLI.
"""
import argparse
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

RATE = 24000
# A natural pace (docs/42): a short breath between sentences, a longer one
# where a new section starts (a step with a transition).
LEAD_MS = 80  # the voice starts just after the picture changes
PAUSE_MS = 350  # between two sentences
SECTION_MS = 700  # before a step with a transition
EDGE_MS = 40  # silence kept at each end of a clip

STEP = re.compile(r'^step\s+"((?:[^"\\]|\\.)*)"(.*)$')
CAPTION = re.compile(r'caption="((?:[^"\\]|\\.)*)"')
HOLD = re.compile(r"\bhold=(\d+)ms\b")


def spoken(script: str) -> list[dict]:
    """The steps in order, with their narration (empty when silent)."""
    out: list[dict] = []
    for i, line in enumerate(script.splitlines()):
        m = STEP.match(line)
        if m:
            c = CAPTION.search(m.group(2))
            rest = CAPTION.sub("", m.group(2))
            out.append({"title": m.group(1), "line": i, "say": c.group(1).replace('\\"', '"') if c else "", "section": "transition=" in rest})
            continue
        s = line.strip()
        if out and s.startswith("# say:") and not out[-1]["say"]:
            out[-1]["say"] = s[len("# say:"):].strip()
    return out


def synth(a: argparse.Namespace) -> None:
    import numpy as np
    from kokoro import KPipeline

    d = Path(a.dir)
    d.mkdir(parents=True, exist_ok=True)
    steps = spoken(Path(a.script).read_text())
    pipe = KPipeline(lang_code=a.voice[0], repo_id="hexgrad/Kokoro-82M")
    for n, st in enumerate(steps):
        st["wav"] = None
        st["ms"] = 0
        if not st["say"]:
            continue
        chunks = [np.asarray(audio) for _, _, audio in pipe(st["say"], voice=a.voice, speed=a.speed)]
        pcm = np.concatenate(chunks)
        # Kokoro adds silence at both ends (about 0.2 s and 0.8 s): cut it, so the pauses are ours.
        loud = np.where(np.abs(pcm) > 0.01)[0]
        if len(loud):
            edge = round(EDGE_MS / 1000 * RATE)
            pcm = pcm[max(0, loud[0] - edge) : loud[-1] + edge]
        f = d / f"{n:02d}.wav"
        with wave.open(str(f), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes((np.clip(pcm, -1, 1) * 32767).astype("<i2").tobytes())
        st["wav"] = f.name
        st["ms"] = round(len(pcm) / RATE * 1000)
        print(f"{n:02d} {st['ms'] / 1000:5.1f} s  {st['title']}")
    (d / "lines.json").write_text(json.dumps(steps, indent=1))


def timeline(scene: str, anivo: str) -> list[tuple[float, float, float]]:
    """(start s, end s, end of the last action s) of each step, from `anivo summary`."""
    text = subprocess.run([*anivo.split(), "summary", scene], capture_output=True, text=True, check=True).stdout
    out: list[tuple[float, float, float]] = []
    for line in text.splitlines():
        m = re.match(r'^\s+\d+\. \S+ ".*" ([\d.]+)-([\d.]+) s$', line)
        if m:
            s = float(m.group(1))
            out.append((s, float(m.group(2)), s))
            continue
        m = re.match(r"^\s+- .* ([\d.]+)-([\d.]+) s", line)
        if m and out:
            s, e, act = out[-1]
            out[-1] = (s, e, max(act, float(m.group(2))))
    return out


def fit(a: argparse.Namespace) -> None:
    """Set hold= so that each step lasts its line: hold = line - (actions), plus a margin."""
    lines = json.loads((Path(a.dir) / "lines.json").read_text())
    path = Path(a.script)
    for rnd in range(3):
        subprocess.run([*a.anivo.split(), "apply", a.scene, str(path), "--mode", "replace"], capture_output=True, check=True)
        spans = timeline(a.scene, a.anivo)
        if len(spans) != len(lines):
            sys.exit(f"The scene has {len(spans)} steps, the script {len(lines)}. Run synth again.")
        src = path.read_text().splitlines()
        changed = 0
        for n, (st, (s, e, act)) in enumerate(zip(lines, spans)):
            if not st["ms"]:
                continue
            nxt = lines[n + 1] if n + 1 < len(lines) else None
            pause = SECTION_MS if nxt is None or nxt.get("section") else PAUSE_MS
            need = (LEAD_MS + st["ms"] + pause) / 1000
            # Too short cuts the line; too long is a dead pause. The summary gives times to 0.1 s.
            if need - 0.1 <= e - s <= need + 0.15 or (e - s > need and act - s >= need - 0.05):
                continue
            changed += 1
            hold = max(0, round((need - (act - s)) * 1000) + 50)
            head = src[st["line"]]
            src[st["line"]] = HOLD.sub(f"hold={hold}ms", head) if HOLD.search(head) else f"{head} hold={hold}ms"
        if changed == 0:
            print(f"All {len(lines)} steps fit their lines. Video: {spans[-1][1]:.1f} s.")
            return
        print(f"Round {rnd + 1}: {changed} steps changed.")
        path.write_text("\n".join(src) + "\n")
    sys.exit("Some steps do not fit their lines yet. Look at the step times.")


def mix(a: argparse.Namespace) -> None:
    d = Path(a.dir)
    lines = json.loads((d / "lines.json").read_text())
    spans = timeline(a.scene, a.anivo)
    total = round(spans[-1][1] * RATE)
    track = bytearray(total * 2)
    for st, (s, _, _) in zip(lines, spans):
        if not st["wav"]:
            continue
        with wave.open(str(d / st["wav"])) as w:
            pcm = w.readframes(w.getnframes())
        at = round((s + LEAD_MS / 1000) * RATE) * 2
        pcm = pcm[: max(0, len(track) - at)]
        track[at : at + len(pcm)] = pcm
    with wave.open(a.out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(track))
    print(f"Wrote {a.out}: {total / RATE:.1f} s.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("synth")
    s.add_argument("script")
    s.add_argument("dir")
    s.add_argument("--voice", default="af_heart")
    s.add_argument("--speed", type=float, default=1.0)
    f = sub.add_parser("fit")
    f.add_argument("script")
    f.add_argument("scene")
    f.add_argument("dir")
    m = sub.add_parser("mix")
    m.add_argument("scene")
    m.add_argument("dir")
    m.add_argument("out")
    for x in (f, m):
        x.add_argument("--anivo", default="anivo")
    a = p.parse_args()
    {"synth": synth, "fit": fit, "mix": mix}[a.cmd](a)


if __name__ == "__main__":
    main()
