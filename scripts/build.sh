#!/usr/bin/env sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"
node -e 'JSON.parse(require("fs").readFileSync("manifest.json", "utf8"))'
VERSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("manifest.json", "utf8")).version)')
mkdir -p dist
zip -q -r -FS "dist/linked-shop-helper-$VERSION.zip" manifest.json popup.html tokens.css src assets -x '*/.DS_Store'
unzip -t "dist/linked-shop-helper-$VERSION.zip" >/dev/null
printf 'Built and verified: dist/linked-shop-helper-%s.zip\n' "$VERSION"
