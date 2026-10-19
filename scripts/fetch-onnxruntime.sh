#!/usr/bin/env bash
# Downloads ONNX Runtime (MIT, Microsoft) for the on-device face cutout and
# puts onnxruntime.dll plus its licence files in src-tauri/resources/.
# The zip's SHA-256 is pinned; a mismatch stops the build.
set -euo pipefail
VERSION=1.31.0
SHA256=3958d8a44984160692c1b4ffd0de3cb48f8c39f9d34bb31e433db06e30b82195
URL="https://github.com/microsoft/onnxruntime/releases/download/v${VERSION}/onnxruntime-win-x64-${VERSION}.zip"
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/src-tauri/resources"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$dest"
if [ -f "$dest/onnxruntime.dll" ] && [ -f "$dest/.onnxruntime-version" ] && [ "$(cat "$dest/.onnxruntime-version")" = "$VERSION" ]; then
  echo "ONNX Runtime $VERSION already in place"
  exit 0
fi
curl -sSfL --retry 3 -o "$work/ort.zip" "$URL"
got=$( (sha256sum "$work/ort.zip" 2>/dev/null || shasum -a 256 "$work/ort.zip") | cut -d' ' -f1)
if [ "$got" != "$SHA256" ]; then
  echo "ONNX Runtime zip checksum mismatch: $got" >&2
  exit 1
fi
if command -v unzip >/dev/null; then
  (cd "$work" && unzip -q ort.zip)
else
  py=$(command -v python3 || command -v python)
  "$py" -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$work/ort.zip" "$work"
fi
src="$work/onnxruntime-win-x64-${VERSION}"
cp "$src/lib/onnxruntime.dll" "$dest/onnxruntime.dll"
cp "$src/LICENSE" "$dest/ONNXRUNTIME-LICENSE.txt"
cp "$src/ThirdPartyNotices.txt" "$dest/ONNXRUNTIME-ThirdPartyNotices.txt"
echo "$VERSION" > "$dest/.onnxruntime-version"
echo "ONNX Runtime $VERSION ready in $dest"
