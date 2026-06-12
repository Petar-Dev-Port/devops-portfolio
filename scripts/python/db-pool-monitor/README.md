# DB Pool Monitor

Monitors a PostgreSQL connection pool and sends a Slack alert when usage crosses
a threshold, or when the database is unreachable. Built to run on cron.

## Files
- `db_health_monitor.py` — the monitor
- `config.yaml` — non-secret settings (safe to commit)

Secrets are not in any file. They come from env vars: `DB_PASSWORD`, `SLACK_WEBHOOK_URL`.

## Run
```
pip install psycopg2-binary requests pyyaml
export DB_PASSWORD="yourpassword"
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"
python3 db_health_monitor.py
```
