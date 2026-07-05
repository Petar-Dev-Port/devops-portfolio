// scripts.js — single source of truth for the showcase.
// Script CODE is imported from the real files via ?raw (no duplication).

import deploySh from "../../scripts/bash/deploy.sh?raw";
import upSh from "../../scripts/bash/up.sh?raw";
import dbMonitorPy from "../../scripts/python/db-pool-monitor/db_health_monitor.py?raw";
import dbConfigYaml from "../../scripts/python/db-pool-monitor/config.yaml?raw";

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
      { name: "deploy.sh", language: "bash", code: deploySh },
    ],
  },
  {
    id: "db-pool-monitor",
    name: "DB Pool Monitor",
    category: "Monitoring",
    language: "python",
    description:
      "Watches a PostgreSQL connection pool and fires a Slack alert when usage crosses a threshold, or when the database stops responding. Config in YAML, secrets in env vars. Built to run on cron.",
    repoPath: "scripts/python/db-pool-monitor/",
    files: [
      { name: "db_health_monitor.py", language: "python", code: dbMonitorPy },
      { name: "config.yaml", language: "yaml", code: dbConfigYaml },
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
      { name: "up.sh", language: "bash", code: upSh },
    ],
  },
];