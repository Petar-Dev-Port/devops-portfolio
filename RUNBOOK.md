# RUNBOOK — devops-portfolio

Operational guide for running the portfolio locally on Windows 10
(WSL2 + Docker + k3d + Kubernetes + ArgoCD + Traefik Ingress).

## Architecture in one paragraph

Nothing critical lives on the local machine. Source code lives on GitHub
(`Petar-Dev-Port/devops-portfolio`), split into a `dev` branch (staging) and a
`main` branch (production). Each branch has a GitHub Actions pipeline that builds
a Docker image, tags it with the commit SHA (`dev-<sha>` / `prod-<sha>`), pushes
it to Docker Hub (`petarpdev/devops-portfolio`), then writes that tag back into
the deployment manifest and commits it. ArgoCD runs inside the k3d cluster,
watches those manifests in Git, and auto-syncs changes into the cluster. Traefik
(built into k3d) routes clean hostnames to each environment. So Git is the source
of truth, and deploys happen on their own after a merge.

Access:
- Dev  → http://dev.localhost  (also http://localhost:30080)
- Prod → http://prod.localhost (also http://localhost:30081)

---

## Daily startup (machine already set up)

```bash
sudo service docker start
k3d cluster start portfolio
cd ~/devops-portfolio
kubectl get pods
```

Then open http://dev.localhost and http://prod.localhost.
(`*.localhost` resolves to 127.0.0.1 automatically; no hosts-file editing.)

ArgoCD starts with the cluster. UI only when needed:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

https://localhost:8080, user `admin`, password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

## Daily shutdown (optional)

```bash
k3d cluster stop portfolio
```

(A "triggering units still active: docker.socket" message is normal.)

## When to use what

- **Editing code, quick look** → `npm run dev` from `frontend/` (no cluster needed)
- **Verify the deployed container** → start the cluster, open the `.localhost` URLs
- **Ship a change** → merge through the Git flow below. Deploys are automatic.

---

## Deploying a change (GitOps, automatic)

```bash
cd ~/devops-portfolio
git checkout dev && git pull
git checkout -b feature/my-change
# edit, then:
git add .
git commit -m "describe the change"
git push -u origin feature/my-change
```

Then on GitHub:
1. PR `feature/my-change` → `dev`, merge. Dev pipeline builds + commits the tag
   back. ArgoCD syncs `portfolio-dev`.
2. Test at http://dev.localhost.
3. PR `dev` → `main`, merge. Prod pipeline does the same. ArgoCD syncs `portfolio-prod`.

Per merge, hands-off:

```
merge -> pipeline builds & pushes :dev-<sha> / :prod-<sha>
      -> pipeline commits the new tag into the deployment manifest [skip ci]
      -> ArgoCD detects the Git change (polls ~3 min) and syncs the cluster
```

Notes:
- `github-actions[bot]` commits are expected, not noise. `git pull` on dev/main
  before your next session to catch up.
- ArgoCD polls every ~3 min; hit REFRESH on the app card to sync immediately.
- Editing a `.github/workflows/` file needs a GitHub token with the `workflow` scope.

---

## Branch guard: only `dev` can merge into `main`

`.github/workflows/guard-main.yml` runs on every PR targeting `main`. If the PR's
source branch is not `dev`, it auto-closes the PR (and the check goes red on
purpose). PRs from `dev` pass green and merge normally. This prevents accidentally
merging a feature branch straight into `main`.

This is a "soft" guard (reacts and closes) rather than branch protection, chosen
because a required-status-check ruleset would block the prod pipeline's direct
commit-back push to `main`. For a future always-on cluster, a protected branch
with a GitHub App on the bypass list is the "proper" upgrade.

---

## Ingress (clean URLs via Traefik)

Traefik ships with k3d and acts as the ingress controller. Two Ingress manifests
(`infrastructure/kubernetes/dev/ingress.yaml`, `.../prod/ingress.yaml`) route
`dev.localhost` and `prod.localhost` to the respective services. They are managed
by ArgoCD like everything else.

The one host requirement: host port 80 must reach the cluster's load balancer.
The cluster was created (or edited) to map it. To verify:

```bash
docker ps --filter "name=k3d-portfolio-serverlb" --format "{{.Ports}}"   # expect 0.0.0.0:80->80
kubectl get ingress                                                       # both hosts listed
```

If port 80 is NOT mapped (e.g. after recreating the cluster without it):

```bash
k3d cluster edit portfolio --port-add "80:80@loadbalancer"
```

This rebuilds only the load-balancer container; ArgoCD and workloads survive.

---

## First-time setup on a fresh machine

Only needed once. Skip if the tools are installed.

### 1. WSL2 + Ubuntu (PowerShell as Administrator)

```powershell
wsl --install -d Ubuntu
```

### 2. Toolchain (inside Ubuntu)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
```

Reopen the terminal so the docker group applies.

### 3. Create the cluster (once) — note port 80 for Ingress

```bash
sudo service docker start
k3d cluster create portfolio \
  --port "80:80@loadbalancer" \
  --port "30080:30080@loadbalancer" \
  --port "30081:30081@loadbalancer"
```

### 4. Get the code

```bash
cd ~
git clone https://github.com/Petar-Dev-Port/devops-portfolio.git
cd devops-portfolio
git checkout dev
```

### 5. Deploy base manifests once

```bash
kubectl apply -f infrastructure/kubernetes/dev/
kubectl apply -f infrastructure/kubernetes/prod/
kubectl get pods -w
```

### 6. Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml --server-side --force-conflicts
kubectl get pods -n argocd -w
```

### 7. Register the ArgoCD apps

```bash
kubectl apply -f infrastructure/argocd/dev-app.yaml
kubectl apply -f infrastructure/argocd/prod-app.yaml
```

From here ArgoCD owns the deployments; let Git drive.

---

## Troubleshooting

**`dev.localhost` / `prod.localhost` won't load**
Check `docker ps ... serverlb` shows `0.0.0.0:80->80`. If not, run the
`k3d cluster edit --port-add` command above. Confirm `kubectl get ingress` lists
both hosts. A Traefik 404 means the Ingress isn't matching; a connection refused
means port 80 isn't mapped.

**ArgoCD app `OutOfSync`**
Hit REFRESH on the app card. Auto-sync (`selfHeal`, `prune`) usually corrects it.

**Merged but new image isn't running**
ArgoCD polls every ~3 min; REFRESH to force. Verify the live pod:
`kubectl get pods` then `kubectl describe pod <new-pod> | grep Image:`.
Old scaled-to-zero ReplicaSets staying around is normal (rollback history).

**Pipeline push rejected: "without `workflow` scope"**
The GitHub token needs the `workflow` scope for `.github/workflows/` changes.

**A PR into main got auto-closed**
That's the guard working: the PR wasn't from `dev`. Merge into `dev` first.

**`ImagePullBackOff`**
`kubectl describe pod <pod>` and read Events. Usually a missing tag on Docker Hub.

**`kubectl` can't connect**
Cluster isn't running: `k3d cluster start portfolio`.

**Git push asks for a password / "carriage return" error**
Use a PAT, not the password. Clean a stray `\r`:
```bash
read -rp "Paste token here: " TOKEN
TOKEN="${TOKEN%$'\r'}"
printf 'https://Petar-Dev-Port:%s@github.com\n' "$TOKEN" > ~/.git-credentials
```

---

## Key facts

| Item | Value |
|------|-------|
| GitHub repo | `Petar-Dev-Port/devops-portfolio` |
| Branches | `dev` (staging), `main` (production) |
| Merge rule | Only `dev` may PR into `main` (guard-main.yml) |
| Docker Hub | `petarpdev/devops-portfolio` (`dev-<sha>`, `prod-<sha>`, `dev-latest`, `latest`) |
| Cluster | `portfolio` (ports 80, 30080, 30081 mapped) |
| Dev URL | http://dev.localhost (or :30080) |
| Prod URL | http://prod.localhost (or :30081) |
| Deployments | `portfolio-dev`, `portfolio-prod` |
| Services | `portfolio-dev-service`, `portfolio-prod-service` |
| Ingress | `infrastructure/kubernetes/{dev,prod}/ingress.yaml` (Traefik) |
| App manifests | `infrastructure/kubernetes/{dev,prod}/` |
| ArgoCD apps | `infrastructure/argocd/{dev,prod}-app.yaml` |
| ArgoCD UI | port-forward `svc/argocd-server -n argocd 8080:443` → https://localhost:8080 |
| Scripts showcase | `frontend/src/scripts.js` (one entry per script) |

---

## What's next (backlog)

- ArgoCD webhook for instant sync instead of ~3 min polling
- Prometheus + Grafana monitoring
- Terraform to define the cluster and tooling as code
- More showcase scripts (Go, Java)
- Switch services to ClusterIP (NodePorts are now redundant with Ingress)
- Public hosting (DigitalOcean droplet running k3s) when ready to share