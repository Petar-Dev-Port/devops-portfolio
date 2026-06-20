// scripts.js — the single source of truth for the showcase.
// To add a script: drop the file(s) under /scripts, then add an object here.

export const profile = {
  name: "Petar",
  role: "DevOps Engineer",
  tagline: "Infrastructure, automation & the scripts that hold it together.",
  github: "https://github.com/Petar-Dev-Port/devops-portfolio",
  handle: "Petar-Dev-Port",
};

export const techStack = [
  { label: "Docker", icon: "🐳" },
  { label: "Kubernetes", icon: "☸️" },
  { label: "Terraform", icon: "🏗️" },
  { label: "Prometheus", icon: "📊" },
  { label: "Grafana", icon: "📈" },
  { label: "GitHub Actions", icon: "🔄" },
  { label: "Linux", icon: "🐧" },
  { label: "Python", icon: "🐍" },
];

// Each script: id, name, category, language, description, repoPath, and files.
// The first file shows by default; extra files become tabs.
export const scripts = [
  {
    id: "frontend-deploy",
    name: "Frontend Deploy",
    category: "CI/CD",
    language: "bash",
    description:
      "Builds the React frontend and syncs the output into the backend's public folder. Aborts and logs a failure if the build breaks, so a broken bundle never ships.",
    repoPath: "scripts/bash/deploy.sh",
    files: [
      {
        name: "deploy.sh",
        language: "bash",
        code: `#!/usr/bin/env bash
#
# deploy.sh — Build the frontend and sync it into the backend's public folder.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/../.." && pwd)"
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

rm -rf backend/public
mkdir -p backend/public
cp -r frontend/dist/. backend/public/

log "DONE: frontend deployed to backend/public"
`,
      },
    ],
  },
  {
    id: "db-pool-monitor",
    name: "DB Pool Monitor",
    category: "Monitoring",
    language: "python",
    description:
      "Watches a PostgreSQL connection pool and fires a Slack alert when usage crosses a threshold — or when the database stops responding. Config in YAML, secrets in env vars. Built to run on cron.",
    repoPath: "scripts/python/db-pool-monitor/",
    files: [
      {
        name: "db_health_monitor.py",
        language: "python",
        code: `#!/usr/bin/env python3
"""Watch a PostgreSQL connection pool and alert via Slack."""
import os
from datetime import datetime

import yaml
import psycopg2
import requests

with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

DB_PASSWORD       = os.environ["DB_PASSWORD"]
SLACK_WEBHOOK_URL = os.environ["SLACK_WEBHOOK_URL"]

DB_HOST    = config["database"]["host"]
DB_PORT    = config["database"]["port"]
DB_NAME    = config["database"]["name"]
DB_USER    = config["database"]["user"]
DB_TIMEOUT = config["database"]["connect_timeout"]
THRESHOLD  = config["monitoring"]["alert_threshold"]


def get_connection_stats():
    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD, connect_timeout=DB_TIMEOUT,
    )
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM pg_stat_activity;")
    active = cursor.fetchone()[0]
    cursor.execute("SELECT current_setting('max_connections');")
    max_conn = int(cursor.fetchone()[0])
    cursor.close()
    conn.close()
    return active, max_conn


def send_slack_alert(message):
    requests.post(SLACK_WEBHOOK_URL, json={"text": message}, timeout=5).raise_for_status()


def main():
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        active, max_conn = get_connection_stats()
    except Exception as e:
        send_slack_alert(f":red_circle: DB UNREACHABLE at {ts} — {e}")
        return

    usage = active / max_conn
    print(f"[{ts}] Active: {active} / Max: {max_conn} ({usage:.0%})")

    if usage >= THRESHOLD:
        send_slack_alert(f":warning: DB pool at {usage:.0%} ({active}/{max_conn}) on {DB_HOST}")
        print("[ALERT SENT] Slack notified.")
    else:
        print("[OK] Connection pool healthy.")


if __name__ == "__main__":
    main()
`,
      },
      {
        name: "config.yaml",
        language: "yaml",
        code: `# Non-secret config. Secrets live in env vars, not here.
database:
  host: localhost
  port: 5432
  name: mydb
  user: monitor_user
  connect_timeout: 5

monitoring:
  alert_threshold: 0.80
`,
      },
    ],
  },
  {
    id: "cluster-bootstrap",
    name: "Cluster Bootstrap",
    category: "Automation",
    language: "bash",
    description:
      "Brings the whole local platform up in one command: starts Docker, starts the k3d cluster, waits until the app pods are actually Ready (not just present), then prints ArgoCD status and access URLs.",
    repoPath: "scripts/bash/up.sh",
    files: [
      {
        name: "up.sh",
        language: "bash",
        code: `#!/usr/bin/env bash
# up.sh — Bring the local platform up and wait until it's actually ready.
set -euo pipefail

CLUSTER="portfolio"
info() { echo -e "\\033[1;34m[up]\\033[0m $*"; }
ok()   { echo -e "\\033[1;32m[ok]\\033[0m $*"; }
warn() { echo -e "\\033[1;33m[!]\\033[0m  $*"; }

info "Starting Docker service..."
sudo service docker start >/dev/null 2>&1 || true
for i in {1..15}; do
  if docker info >/dev/null 2>&1; then ok "Docker is up."; break; fi
  sleep 1
  [ "$i" -eq 15 ] && { warn "Docker did not come up in time."; exit 1; }
done

if k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  info "Starting k3d cluster '$CLUSTER'..."
  k3d cluster start "$CLUSTER" >/dev/null
  ok "Cluster started."
else
  warn "Cluster '$CLUSTER' does not exist. Create it first (see RUNBOOK)."
  exit 1
fi

info "Waiting for app pods to become Ready..."
kubectl wait --for=condition=Ready pods -l app=portfolio -n default --timeout=120s >/dev/null 2>&1 \\
  && ok "Portfolio pods are Ready." || warn "Pods not Ready within 120s."

ok "Platform is up:  http://dev.localhost  |  http://prod.localhost"
`,
      },
    ],
  },
];