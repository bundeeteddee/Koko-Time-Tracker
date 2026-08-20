#!/bin/bash
# Usage: build-gif.sh <frames-dir> <out.gif> [width] [max_colors]
set -euo pipefail
FR="$1"; OUT="$2"; WIDTH="${3:-960}"; COLORS="${4:-64}"
LIST="$FR/list.txt"
node -e '
const fs=require("fs"),p=require("path");
const dir=process.argv[1];
const m=JSON.parse(fs.readFileSync(p.join(dir,"manifest.json")));
let out="";
for (const f of m) out += `file '"'"'${p.basename(f.file)}'"'"'\nduration ${f.dur.toFixed(3)}\n`;
out += `file '"'"'${p.basename(m[m.length-1].file)}'"'"'\n`;  // concat demuxer drops the last frame otherwise
fs.writeFileSync(p.join(dir,"list.txt"), out);
' "$FR"
SCALE="scale=${WIDTH}:-1:flags=lanczos"
ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$LIST" \
  -vf "$SCALE,palettegen=max_colors=${COLORS}:stats_mode=diff" -y "$FR/palette.png"
ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$LIST" -i "$FR/palette.png" \
  -lavfi "$SCALE[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -vsync vfr -loop 0 -y "$OUT"
ls -lh "$OUT"
