"""Give a .anivo scene a look: a custom theme preset, and optional font files.

  look.py <scene.anivo> <preset> [--font FILE ...] [--family NAME]

Presets: classroom, classic, blueprint, black-metal. A font file goes into the scene file, and
the theme uses it for all text, captions, and code (customTheme.font).
A look is colors only: it keeps the style, the background pattern, and the
caption style of the scene. Run it after `voice.py fit` and before `render`:
fit applies the script in replace mode, which removes the look.
"""
import argparse
import json
import zipfile
from pathlib import Path

PRESETS = {
    # Exercise book: warm paper, navy ink, blue pen, red pen, green tick, yellow highlighter.
    "classroom": {
        "base": "paper-light",
        "dark": False,
        "strokeWidth": 2.5,
        "cornerRadius": 14,
        "background": {"kind": "grid"},
        "captionStyle": "marker",
        "tokens": {
            "background": "#FCF9F0",
            "grid": "#E4EAF2",
            "surface": "#FFFFFF",
            "surface-strong": "#F4EFE1",
            "text": "#1F2D4A",
            "muted": "#5F6B7A",
            "line": "#3B4A63",
            "accent": "#2F6DB5",
            "accent-soft": "#DCE8F7",
            "danger": "#D2423B",
            "danger-soft": "#FBE1DE",
            "success": "#2E8A57",
            "success-soft": "#DDF1E4",
            "warning": "#D99A00",
            "warning-soft": "#FFF1BF",
            "purple": "#7A57B0",
            "purple-soft": "#ECE4F7",
            "teal": "#1F8C88",
            "teal-soft": "#D8EFEE",
        },
    },
    # Classic: the classroom look (hand-drawn, grid, highlighter) in cool white with classic ink colors.
    # A theme is colors only: it does not change the style, the font, or the caption style.
    "classic": {
        "base": "paper-light",
        "dark": False,
        "strokeWidth": 2.5,
        "cornerRadius": 14,
        "background": {"kind": "grid"},
        "captionStyle": "marker",
        "tokens": {
            "background": "#FFFFFF",
            "grid": "#E3EAF2",
            "surface": "#FFFFFF",
            "surface-strong": "#F2F3F5",
            "text": "#1C1F24",
            "muted": "#5E656E",
            "line": "#2B3038",
            "accent": "#1F5FBF",
            "accent-soft": "#E3ECFA",
            "danger": "#C8312B",
            "danger-soft": "#FBE4E2",
            "success": "#23874B",
            "success-soft": "#E1F3E8",
            "warning": "#C27A00",
            "warning-soft": "#FFEFA6",
            "purple": "#6B4BAF",
            "purple-soft": "#EEE8F8",
            "teal": "#16807C",
            "teal-soft": "#DDF1F0",
        },
    },
    # Blueprint: deep blue paper, a fine light grid, white ink, pale cyan, and a warm highlighter.
    "blueprint": {
        "base": "studio-dark",
        "dark": True,
        "strokeWidth": 2.5,
        "cornerRadius": 14,
        "background": {"kind": "grid"},
        "captionStyle": "marker",
        "tokens": {
            "background": "#16467E",
            "grid": "#2A5C96",
            "surface": "#1C4F8A",
            "surface-strong": "#225896",
            "text": "#F2F7FF",
            "muted": "#B3C8E4",
            "line": "#DCE8F8",
            "accent": "#8FD3FF",
            "accent-soft": "#235E9C",
            "danger": "#FF9C8F",
            "danger-soft": "#5A3A5E",
            "success": "#9EEBB8",
            "success-soft": "#1F6670",
            "warning": "#E8913A",
            "warning-soft": "#5B5560",
            "purple": "#D2B8FF",
            "purple-soft": "#3B4F96",
            "teal": "#7FE6E0",
            "teal-soft": "#1C6680",
        },
    },
    # Pitch black, bone white, blood red, cold steel.
    "black-metal": {
        "base": "studio-dark",
        "dark": True,
        "strokeWidth": 1.5,
        "cornerRadius": 2,
        "background": {"kind": "solid", "vignette": 0.55, "grain": 0.18},
        "captionStyle": "subtitle",
        "tokens": {
            "background": "#050505", "grid": "#121212", "surface": "#0D0D0D", "surface-strong": "#171717",
            "text": "#E6E1D8", "muted": "#7D7872", "line": "#3A3836",
            "accent": "#D0203A", "accent-soft": "#24060A", "danger": "#E3263B", "danger-soft": "#2A080D",
            "success": "#B9C7D0", "success-soft": "#12181C", "warning": "#C7B08A", "warning-soft": "#221D14",
            "purple": "#8A8494", "purple-soft": "#16141A", "teal": "#8FA3AD", "teal-soft": "#101619",
        },
    },
}


def asset_id(b: bytes) -> str:
    """The same as assetId in packages/fileio (two 32-bit FNV-1a passes)."""
    h1, h2 = 0x811C9DC5, 0x050C5D1F
    for i, x in enumerate(b):
        h1 = ((h1 ^ x) * 0x01000193) & 0xFFFFFFFF
        h2 = ((h2 ^ x ^ (i & 0xFF)) * 0x01000193) & 0xFFFFFFFF
    return f"{h1:08x}{h2:08x}"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("scene")
    p.add_argument("preset", choices=sorted(PRESETS))
    p.add_argument("--font", nargs="*", default=[], help="font files (ttf, otf, woff2) of one family")
    p.add_argument("--family", default="Scene Font")
    a = p.parse_args()

    with zipfile.ZipFile(a.scene) as z:
        scene = json.loads(z.read("scene.json"))
        files = {n: z.read(n) for n in z.namelist() if n != "scene.json"}
    pr = PRESETS[a.preset]
    st = scene["settings"]
    st["theme"] = a.preset
    st["customTheme"] = {"name": a.preset, "base": pr["base"], "dark": pr["dark"], "tokens": pr["tokens"], "strokeWidth": pr["strokeWidth"], "cornerRadius": pr["cornerRadius"]}
    # A look is colors only (owner): it keeps the background pattern, the style, and the caption
    # style of the scene. It adds only the effects (vignette, grain) and the defaults that are not set.
    bg = st.get("background", {})
    st["background"] = {**pr["background"], **bg, **{k: v for k, v in pr["background"].items() if k != "kind"}}
    # The caption look that fits the preset (docs/41), only if the scene has none.
    st.setdefault("captionStyle", pr["captionStyle"])
    if a.font:
        st["customTheme"]["font"] = a.family
        st["fonts"] = []
        scene.setdefault("assets", {})
        for f in a.font:
            b = Path(f).read_bytes()
            i = asset_id(b)
            mime = {"ttf": "font/ttf", "otf": "font/otf", "woff2": "font/woff2", "woff": "font/woff"}[Path(f).suffix[1:].lower()]
            scene["assets"][i] = {"id": i, "mime": mime, "bytes": len(b), "name": Path(f).name}
            st["fonts"].append({"family": a.family, "assetId": i})
            files[f"assets/{i}"] = b
    with zipfile.ZipFile(a.scene, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("scene.json", json.dumps(scene))
        for n, b in files.items():
            z.writestr(n, b)
    print(f"{a.scene}: look {a.preset}" + (f", font {a.family} ({len(a.font)} files)" if a.font else ""))


if __name__ == "__main__":
    main()
