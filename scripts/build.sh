#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

for command in node zip unzip; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  }
done

node -e 'JSON.parse(require("fs").readFileSync("manifest.json", "utf8"))'

VERSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("manifest.json", "utf8")).version)')
ICON_PATH=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("manifest.json", "utf8")).icons?.["128"] || "")')

[ -n "$ICON_PATH" ] && [ -f "$ICON_PATH" ] || {
  printf 'Missing extension icon declared in manifest.json\n' >&2
  exit 1
}

OUTPUT_DIR=dist
OUTPUT_FILE="$OUTPUT_DIR/linked-shop-helper-$VERSION.zip"

mkdir -p "$OUTPUT_DIR"
zip -q -r -FS "$OUTPUT_FILE" manifest.json popup.html tokens.css src assets -x '*/.DS_Store'
unzip -t "$OUTPUT_FILE" >/dev/null

printf 'Built and verified: %s\n' "$OUTPUT_FILE"
