#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-}"
TARGET="${2:-}"
if [[ -z "${ZIP_PATH}" || -z "${TARGET}" ]]; then
  echo "Usage: smoke-check.sh <zip-path> <chromium|firefox|opera>"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
unzip -q "${ZIP_PATH}" -d "${TMP_DIR}"

for required in manifest.json src/background.js src/content.js src/adapters.js src/popup.html src/options.html assets/icons/icon-128.png; do
  if [[ ! -f "${TMP_DIR}/${required}" ]]; then
    echo "Missing required file: ${required}"
    exit 1
  fi
done

node -e "
const fs = require('fs');
const target = process.argv[1];
const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.manifest_version !== 3) {
  throw new Error('manifest_version must be 3');
}
if (!manifest.background?.service_worker) {
  throw new Error('background.service_worker is required');
}
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
  throw new Error('content_scripts is required');
}
if (target === 'firefox' && !manifest.browser_specific_settings?.gecko?.id) {
  throw new Error('firefox target requires browser_specific_settings.gecko.id');
}
if (target !== 'firefox' && manifest.browser_specific_settings) {
  throw new Error('chromium/opera target should not include browser_specific_settings');
}
" "${TARGET}" "${TMP_DIR}/manifest.json"

echo "Smoke check passed: ${ZIP_PATH} (${TARGET})"
