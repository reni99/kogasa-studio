#!/usr/bin/env bash
#
# Rebuilds assets/fonts/*.woff2.
#
# Google serves a Japanese family as hundreds of unicode-range subsets, so asking it for
# three families cost about fifty requests on every cold visit and held the text up for
# seconds. These files carry the Latin alphabet and only the Japanese characters this page
# writes, which is why they are small enough to self-host.
#
# Run this after writing a Japanese character the page has not used before; anything missing
# falls back to the system serif instead. Needs fonttools and brotli:
#   pip install fonttools brotli
#
set -euo pipefail
cd "$(dirname "$0")/.."

src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT

# Latin, the punctuation the copy uses, and every non-Latin character in the page
latin="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2013,U+2014,U+2018-201A,U+201C-201E,U+2026,U+2192,U+2193,U+00B7,U+00A9"
japanese=$(python3 - <<'PY'
import re
html = open("index.html", encoding="utf-8").read()
text = re.sub(r"<[^>]*>", " ", html)          # rendered text only, not markup
chars = sorted({c for c in text if ord(c) > 0x2000 and not c.isspace()})
print(",".join("U+%04X" % ord(c) for c in chars))
PY
)

mkdir -p assets/fonts
subset () {  # family-dir, source-file, output-name
  curl -sfL -o "$src/$2" "https://raw.githubusercontent.com/google/fonts/main/ofl/$1/$2"
  curl -sfL -o "assets/fonts/OFL-$1.txt" "https://raw.githubusercontent.com/google/fonts/main/ofl/$1/OFL.txt"
  pyftsubset "$src/$2" --output-file="assets/fonts/$3.woff2" --flavor=woff2 \
    --unicodes="$latin,$japanese" \
    --layout-features='kern,liga,palt,vert,vrt2,locl,calt' \
    --no-hinting --desubroutinize --name-IDs='0,1,2,3,4,5,6'
  printf '%-32s %s\n' "$3.woff2" "$(du -h "assets/fonts/$3.woff2" | cut -f1)"
}

subset zenoldmincho     ZenOldMincho-Regular.ttf     zen-old-mincho-400
subset zenoldmincho     ZenOldMincho-Bold.ttf        zen-old-mincho-700
subset zenoldmincho     ZenOldMincho-Black.ttf       zen-old-mincho-900
subset zenkakugothicnew ZenKakuGothicNew-Regular.ttf zen-kaku-gothic-new-400
subset zenkakugothicnew ZenKakuGothicNew-Medium.ttf  zen-kaku-gothic-new-500
subset zenkakugothicnew ZenKakuGothicNew-Bold.ttf    zen-kaku-gothic-new-700
subset yujiboku         YujiBoku-Regular.ttf         yuji-boku-400
