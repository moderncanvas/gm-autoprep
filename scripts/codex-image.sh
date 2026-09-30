#!/bin/bash
# Generate one image with ChatGPT's image model through the Codex CLI (uses your own ChatGPT
# login — fine for your own campaign; a hosted product would need the metered API instead).
# usage: codex-image.sh <out dir> <name> "<prose prompt>" [size e.g. 1536x1024]
# Runs in the background; ~1 min. Poll for <out dir>/<name>.png. 5 in parallel is fine.
set -e
out=$1; name=$2; prompt=$3; size=${4:-}
command -v codex >/dev/null || { echo "codex CLI not found — install it or set art.provider: manual in campaign.yaml" >&2; exit 1; }
mkdir -p "$out"; cd "$out"
extra=""; [ -n "$size" ] && extra=" at $size"
nohup timeout 1200 codex exec --skip-git-repo-check -s workspace-write \
  "Use your image generation tool to create ONE image$extra, then copy the resulting PNG into the current directory as $name.png. Do nothing else. Image: $prompt" \
  > "$name.log" 2>&1 &
echo "started $name (pid $!) -> $out/$name.png"
