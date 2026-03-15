#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
OUTPUT_DIR="${2:-}"
if [[ -z "${TARGET}" ]]; then
  echo "Usage: build-zip.sh <chromium|firefox|opera> [output-dir]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${OUTPUT_DIR:-${ROOT_DIR}/dist}"

mkdir -p "${OUT_DIR}"
TMP_DIR="$(mktemp -d)"

cp -R "${ROOT_DIR}/src" "${TMP_DIR}/src"
cp -R "${ROOT_DIR}/assets" "${TMP_DIR}/assets"
cp "${ROOT_DIR}/README.md" "${TMP_DIR}/README.md"
cp "${ROOT_DIR}/PRIVACY_POLICY.md" "${TMP_DIR}/PRIVACY_POLICY.md"

node "${ROOT_DIR}/scripts/manifest-target.mjs" \
  "${ROOT_DIR}/manifest.json" \
  "${TMP_DIR}/manifest.json" \
  "${TARGET}"

VERSION="$(node -e "const fs=require('fs');const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p,'utf8'));process.stdout.write(m.version);" "${TMP_DIR}/manifest.json")"
ZIP_NAME="manga-tracker-sync-v${VERSION}-${TARGET}.zip"
ZIP_PATH="${OUT_DIR}/${ZIP_NAME}"

(
  cd "${TMP_DIR}"
  zip -rq "${ZIP_PATH}" manifest.json src assets README.md PRIVACY_POLICY.md
)

echo "${ZIP_PATH}"
