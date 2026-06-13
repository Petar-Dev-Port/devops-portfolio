# RUNBOOK — devops-portfolio

Operational guide for running the portfolio locally on Windows 10
(WSL2 + Docker + k3d + Kubernetes + ArgoCD).

## Architecture in one paragraph

Nothing critical lives on the local machine. Source code lives on GitHub
(`Petar-Dev-Port/devops-portfolio`), split into a `dev` branch (staging) and a
`main` branch (production). Each branch has a GitHub Actions pipeline that builds
a Docker image, tags it with the commit SHA (`dev-<sha>` / `prod-<sha>`), pushes
it to Docker Hub (`petarpdev/devops-portfolio`), then writes that exact tag back
into the deployment manifest and commits it to the repo. ArgoCD runs inside the
k3d cluster, watches those manifests in Git, and automatically syncs any change
into the cluster. So Git is the source of truth, and deploys happen on their own
after a merge. Dev serves on `localhost:30080`, prod on `localhost:30081`.

---

## Daily startup (machine already set up)

```bash
sudo service docker start
k3d cluster start portfolio
cd ~/devops-portfolio
kubectl get pods
```

Then open:
- Dev  → http://localhost:30080
- Prod → http://localhost:30081

No `apply` or `create` needed day to day. The cluster remembers everything, and
ArgoCD (in the `argocd` namespace) starts automatically with the cluster.

To open the ArgoCD UI (only when you want to watch/manage deploys):

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Then https://localhost:8080 (click through the self-signed cert warning).
User `admin`. Initial password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

## Daily shutdown (optional)

```bash
k3d cluster stop portfolio
```

Optionally also `sudo service docker stop` to free resources.
(A "triggering units still active: docker.socket" message is normal, not an error.)

## When to use what

- **Editing code, quick look** → `npm run dev` from `frontend/` (no cluster needed)
- **Verify the deployed container / screenshot dev+prod** → start the cluster
- **Ship a change** → merge through the Git flow below. Deploys are automatic; no
  manual `kubectl rollout` or `kubectl apply` for the apps.

---

## Deploying a change (GitOps, automatic)

You never manually deploy the app anymore. The flow:

```bash
cd ~/devops-portfolio
git checkout dev && git pull
git checkout -b feature/my-change
# edit files, then:
git add .
git commit -m "describe the change"
git push -u origin feature/my-change
```

Then on GitHub:
1. PR `feature/my-change` → `dev`, merge. The dev pipeline builds, pushes, and
   commits the new image tag back to `dev`. ArgoCD syncs `portfolio-dev`.
2. Test at http://localhost:30080.
3. PR `dev` → `main`, merge. The prod pipeline does the same for `main`.
   ArgoCD syncs `portfolio-prod`.

What happens after each merge, hands-off:

```
merge -> pipeline builds & pushes :dev-<sha> / :prod-<sha>
      -> pipeline commits the new tag into the deployment manifest [skip ci]
      -> ArgoCD detects the Git change (polls ~3 min) and syncs the cluster
```

Notes:
- The pipeline pushes commits as `github-actions[bot]`. Those are expected, not noise.
- After a merge your local `dev`/`main` are behind by the bot commit. Run
  `git pull` on each before your next session.
- ArgoCD polls every ~3 min. To sync immediately, hit REFRESH on the app card in
  the UI (or set up a webhook later).
- Editing a workflow file under `.github/workflows/` requires a GitHub token with
  the `workflow` scope, not just `repo`.

---

## First-time setup on a fresh machine

Only needed once. Skip entirely if the tools are already installed.

### 1. WSL2 + Ubuntu (PowerShell as Administrator)

```powershell
wsl --install -d Ubuntu
```

Reboot if prompted, then set a username/password inside Ubuntu.

### 2. Toolchain (inside Ubuntu)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Docker engine
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# k3d
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
```

Close and reopen the Ubuntu terminal so the docker group applies.

### 3. Create the cluster (once)

```bash
sudo service docker start
k3d cluster create portfolio \
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

> **Trap:** `git clone` drops you on `main`. Most active work happens on `dev`.

### 5. Deploy the base manifests once

The very first time, apply the app manifests so the pods exist:

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

(`--server-side --force-conflicts` avoids the large-CRD annotation error.)

### 7. Register the ArgoCD apps

```bash
kubectl apply -f infrastructure/argocd/dev-app.yaml
kubectl apply -f infrastructure/argocd/prod-app.yaml
```

From here on, ArgoCD owns the deployments. Do not `kubectl apply` the app
manifests manually again; let Git drive.

---

## Troubleshooting

**ArgoCD app shows `OutOfSync`**
Git and the cluster differ. Hit REFRESH on the app card, or SYNC if auto-sync is
off. Auto-sync (`selfHeal`, `prune`) is enabled in the app manifests, so it
usually corrects itself.

**Merged but the new image isn't running yet**
ArgoCD polls every ~3 min. Hit REFRESH on the app card to force it. Confirm the
running pod's image:

```bash
kubectl get pods
kubectl describe pod <new-pod-name> | grep Image:
```

A Deployment keeps the old (scaled-to-zero) ReplicaSet around for rollback, so
seeing an old ReplicaSet "a day old" next to a new running pod is normal.

**Pipeline push rejected: "without `workflow` scope"**
The GitHub token needs the `workflow` scope to change files under
`.github/workflows/`. Edit the token at github.com/settings/tokens, add it.

**Pod stuck on `ImagePullBackOff` / `ErrImagePull`**
The cluster can't pull the image. `kubectl describe pod <pod-name>` and read the
`Events`. Usually a missing tag on Docker Hub or no network. Check
https://hub.docker.com/r/petarpdev/devops-portfolio.

**`kubectl` can't connect to the cluster**
The cluster isn't running. `k3d cluster start portfolio`.

**Docker commands fail with permission denied**
Docker isn't started or the group didn't apply. `sudo service docker start`, and
reopen the terminal.

**Site doesn't load at localhost:30080 / 30081**
Check the pod is `Running` and the service exists (`kubectl get pods,svc`). The
cluster must have been created with both `--port` mappings (see step 3).

**Git push prompts for a password / "carriage return" error**
GitHub needs a Personal Access Token, not your password. If a pasted token has a
trailing carriage return, store it cleanly:
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
| Docker Hub | `petarpdev/devops-portfolio` (tags: `dev-<sha>`, `prod-<sha>`, plus `dev-latest` / `latest`) |
| Cluster name | `portfolio` |
| Dev URL | http://localhost:30080 |
| Prod URL | http://localhost:30081 |
| Deployments | `portfolio-dev`, `portfolio-prod` |
| Services | `portfolio-dev-service` (30080), `portfolio-prod-service` (30081) |
| App manifests | `infrastructure/kubernetes/dev/`, `infrastructure/kubernetes/prod/` |
| ArgoCD apps | `infrastructure/argocd/dev-app.yaml`, `prod-app.yaml` |
| ArgoCD UI | `kubectl port-forward svc/argocd-server -n argocd 8080:443` -> https://localhost:8080 |
| Scripts showcase | `frontend/src/scripts.js` (add an entry per new script) |

---

## What's next (backlog)

- Ingress for clean URLs (e.g. `dev.localhost` / `prod.localhost`) instead of NodePorts
- ArgoCD webhook for instant sync instead of ~3 min polling
- Prometheus + Grafana monitoring
- Terraform to define the cluster and tooling as code
- More showcase scripts (Go, Java)
- Public hosting (DigitalOcean droplet running k3s) when ready to share