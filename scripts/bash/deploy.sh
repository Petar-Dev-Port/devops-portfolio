#!/usr/bin/env bash
#
# deploy.sh — Build the frontend and sync it into the backend's public folder.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_FILE="$ROOT_DIR/deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "Starting frontend build..."
cd "$ROOT_DIR/frontend"

if ! npm run build; then
  log "FAIL: 'npm run build' returned an error. Nothing was copied."
  exit 1
fi

log "Build succeeded. Syncing frontend/dist -> backend/public ..."
cd "$ROOT_DIR"

# Linux equivalent of: xcopy frontend\dist\* backend\public\ /s /e
rm -rf backend/public
mkdir -p backend/public
cp -r frontend/dist/. backend/public/

log "DONE: frontend deployed and copied to backend/public"
