#!/usr/bin/env bash
#
# up.sh — Bring the whole local platform up and wait until it's actually ready.
#
# Does, in order:
#   1. Starts the Docker service
#   2. Starts the k3d cluster
#   3. Waits for the app pods to be Ready (not just present)
#   4. Prints the access URLs and ArgoCD app status
#
# Usage:  ./scripts/bash/up.sh
#
set -euo pipefail

CLUSTER="portfolio"

info() { echo -e "\033[1;34m[up]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ok]\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m  $*"; }

# 1. Docker
info "Starting Docker service..."
sudo service docker start >/dev/null 2>&1 || true
# Wait for the docker daemon to actually respond
for i in {1..15}; do
  if docker info >/dev/null 2>&1; then ok "Docker is up."; break; fi
  sleep 1
  [ "$i" -eq 15 ] && { warn "Docker did not come up in time."; exit 1; }
done

# 2. Cluster
if k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  info "Starting k3d cluster '$CLUSTER'..."
  k3d cluster start "$CLUSTER" >/dev/null
  ok "Cluster started."
else
  warn "Cluster '$CLUSTER' does not exist. Create it first (see RUNBOOK)."
  exit 1
fi

# 3. Wait for the app pods to be Ready
info "Waiting for app pods to become Ready..."
if kubectl wait --for=condition=Ready pods \
     -l app=portfolio -n default --timeout=120s >/dev/null 2>&1; then
  ok "Portfolio pods are Ready."
else
  warn "Pods not Ready within 120s. Check 'kubectl get pods'."
fi

# 4. Status + URLs
echo
info "ArgoCD applications:"
kubectl get applications -n argocd 2>/dev/null \
  | awk 'NR==1 || /portfolio|monitoring/ {print "    " $0}' \
  || warn "Could not read ArgoCD apps."

echo
ok "Platform is up. Access:"
echo "    Dev   →  http://dev.localhost"
echo "    Prod  →  http://prod.localhost"
echo
echo "    ArgoCD UI :  kubectl port-forward svc/argocd-server -n argocd 8080:443  → https://localhost:8080"
echo "    Grafana   :  kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80 → http://localhost:3000"