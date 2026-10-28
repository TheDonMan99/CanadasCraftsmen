"""Download the 14 shipped fonts from the Google Fonts repository into public/fonts.

Variable fonts are pinned to a static instance (for example Dancing Script at
weight 700) so the engine always cuts the exact weight named in the catalog.
Each font's licence file is saved beside it.

Run once with:  pip install fonttools && python3 scripts/prepare_fonts.py
The results are committed, so the app never downloads fonts at runtime.
"""

import io
import json
import pathlib
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fonts"
BASE = "https://raw.githubusercontent.com/google/fonts/main"

# file name in the app, repo path, licence path, weight for variable fonts
FONTS = [
    ("Pacifico-Regular.ttf", "ofl/pacifico/Pacifico-Regular.ttf", "ofl/pacifico/OFL.txt", None),
    ("Lobster-Regular.ttf", "ofl/lobster/Lobster-Regular.ttf", "ofl/lobster/OFL.txt", None),
    ("KaushanScript-Regular.ttf", "ofl/kaushanscript/KaushanScript-Regular.ttf", "ofl/kaushanscript/OFL.txt", None),
    ("Yellowtail-Regular.ttf", "apache/yellowtail/Yellowtail-Regular.ttf", "apache/yellowtail/LICENSE.txt", None),
    ("DancingScript-Bold.ttf", "ofl/dancingscript/DancingScript[wght].ttf", "ofl/dancingscript/OFL.txt", 700),
    ("Satisfy-Regular.ttf", "apache/satisfy/Satisfy-Regular.ttf", "apache/satisfy/LICENSE.txt", None),
    ("GreatVibes-Regular.ttf", "ofl/greatvibes/GreatVibes-Regular.ttf", "ofl/greatvibes/OFL.txt", None),
    ("AlexBrush-Regular.ttf", "ofl/alexbrush/AlexBrush-Regular.ttf", "ofl/alexbrush/OFL.txt", None),
    ("PlayfairDisplay-Bold.ttf", "ofl/playfairdisplay/PlayfairDisplay[wght].ttf", "ofl/playfairdisplay/OFL.txt", 700),
    ("AbrilFatface-Regular.ttf", "ofl/abrilfatface/AbrilFatface-Regular.ttf", "ofl/abrilfatface/OFL.txt", None),
    ("Montserrat-Bold.ttf", "ofl/montserrat/Montserrat[wght].ttf", "ofl/montserrat/OFL.txt", 700),
    ("BebasNeue-Regular.ttf", "ofl/bebasneue/BebasNeue-Regular.ttf", "ofl/bebasneue/OFL.txt", None),
    ("Oswald-Regular.ttf", "ofl/oswald/Oswald[wght].ttf", "ofl/oswald/OFL.txt", 400),
    ("AmaticSC-Bold.ttf", "ofl/amaticsc/AmaticSC-Bold.ttf", "ofl/amaticsc/OFL.txt", None),
]


def fetch(path: str) -> bytes:
    url = f"{BASE}/{path.replace('[', '%5B').replace(']', '%5D')}"
    with urllib.request.urlopen(url) as r:
        return r.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, src, licence, weight in FONTS:
        data = fetch(src)
        if weight is not None:
            font = TTFont(io.BytesIO(data))
            static = instancer.instantiateVariableFont(font, {"wght": weight}, updateFontNames=True)
            buf = io.BytesIO()
            static.save(buf)
            data = buf.getvalue()
        (OUT / name).write_bytes(data)
        licence_name = name.rsplit(".", 1)[0] + ".LICENSE.txt"
        (OUT / licence_name).write_bytes(fetch(licence))
        manifest.append({"file": name, "licence": licence_name, "source": f"{BASE}/{src}", "weight": weight})
        print(f"saved {name} ({len(data)} bytes)")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
