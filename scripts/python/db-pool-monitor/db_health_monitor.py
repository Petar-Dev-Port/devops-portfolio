#!/usr/bin/env python3
"""Watch a PostgreSQL connection pool and alert via Slack."""
import os
from datetime import datetime

import yaml
import psycopg2
import requests

# Non-secret config from YAML; safe_load prevents code execution and mainly vector attacks.
with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

# Secrets come from the environment, never from a committed file.
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
