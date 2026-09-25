#!/bin/bash
# Cron entry point. Safe to run daily: the script only does real work once
# every 90 days (a full sweep of all brands); on other days it exits at once.
# Installed via `crontab -l` — see the entry added alongside this file.
set -euo pipefail

cd "$(dirname "$0")/.."

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm use 26.7.0 >/dev/null

set -a
source .env
set +a

node scripts/refresh-brand-cache.mjs all 1
