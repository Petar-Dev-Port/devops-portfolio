# RUNBOOK: devops-portfolio

Operational guide for running the portfolio locally on Windows
(WSL2 + Docker + k3d + Kubernetes + ArgoCD + Traefik Ingress).

## Architecture in one paragraph

Nothing critical lives on the local machine. Source code lives on GitHub
(`Petar-Dev-Port/devops-portfolio`), split into a `dev` branch (staging) and a
`main` branch (production). Each branch has a GitHub Actions pipeline that builds
a Docker image, tags it with the commit SHA (`dev-<sha>` / `prod-<sha>`), pushes
it to Docker Hub (`petarpdev/devops-portfolio`), then writes that tag into the
environment's **`kustomization.yaml`** (`images:` -> `newTag:`) and commits it
back. ArgoCD runs inside the k3d cluster, watches those manifests in Git, renders
them with Kustomize, and auto-syncs changes into the cluster. Traefik (built into
k3d) routes clean hostnames to each environment. Git is the source of truth, and
deploys happen on their own after a merge.

Access:
- Dev: http://dev.localhost  (also http://localhost:30080)
- Prod: http://prod.localhost (also http://localhost:30081)

---

## Daily startup (machine already set up)

The fast way (one command does Docker + cluster + readiness check + status):

```bash
cd ~/devops-portfolio
./scripts/bash/up.sh
```

The manual equivalent:

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

---

## Live demo via Cloudflare Tunnel

For showing the running site to someone (e.g. in an interview), expose the local
prod site through a temporary public URL. The cluster must be running first.

```bash
cloudflared tunnel --url http://localhost:30081
```

This prints a random `https://<words>.trycloudflare.com` URL that routes to prod.
Open or share it; it is live only while the command runs. `Ctrl+C` ends it.

Notes:
- Points at the **NodePort** (`:30081`), not the ingress, because the ingress
  routes by hostname (`prod.localhost`) and the tunnel sends a different Host
  header. The NodePort goes straight to the prod service, so no host-matching.
- The URL is random and changes each run. This is for on-demand demos, not a
  permanent link. A stable URL would need a Cloudflare account plus a domain.
- Only ever tunnel the public static site. **Never** tunnel admin tools such as
  the ArgoCD UI or Grafana (default credentials would be exposed publicly).
- When the tunnel is off, nothing is exposed: no background service, no open port.

---

## When to use what

- **Editing code, quick look:** `npm run dev` from `frontend/` (no cluster needed)
- **Verify the deployed container:** start the cluster, open the `.localhost` URLs
- **Show it to someone:** start the cluster, run the Cloudflare Tunnel above
- **Ship a change:** merge through the Git flow below. Deploys are automatic.

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
1. PR `feature/my-change` -> `dev`. The AI reviewer comments on it. Merge it. The
   dev pipeline builds and commits the tag into `dev/kustomization.yaml`. ArgoCD
   syncs `portfolio-dev`.
2. Test at http://dev.localhost.
3. PR `dev` -> `main`, merge. Prod pipeline does the same into
   `prod/kustomization.yaml`. ArgoCD syncs `portfolio-prod`.

Per merge, hands-off:

```
merge -> pipeline builds & pushes :dev-<sha> / :prod-<sha>
      -> pipeline writes newTag into the env's kustomization.yaml [skip ci]
      -> ArgoCD detects the Git change (polls ~3 min), renders Kustomize, syncs
```

Notes:
- `github-actions[bot]` commits are expected, not noise. `git pull` on dev/main
  before your next session to catch up.
- ArgoCD polls every ~3 min; hit REFRESH on the app card to sync immediately.
- Editing a `.github/workflows/` file needs a GitHub token with the `workflow` scope.

---

## Image tags live in Kustomize (why there are no more merge conflicts)

The deployment manifests (`infrastructure/kubernetes/{dev,prod}/deployment.yaml`)
are **static**: the image is referenced as `petarpdev/devops-portfolio` with no
tag. The tag is set in each environment's `kustomization.yaml`:

```yaml
images:
  - name: petarpdev/devops-portfolio
    newTag: dev-<sha>      # prod uses prod-<sha> / latest
```

ArgoCD runs `kustomize build` and stamps the tag into the rendered deployment.
The pipelines edit only `newTag`, and dev and prod own separate kustomization
files, so the tag change never collides across branches. This replaced the old
approach (editing the image line directly in `deployment.yaml`), which caused a
recurring merge conflict on every `dev` -> `main` promotion.

To preview what ArgoCD will apply:

```bash
kubectl kustomize infrastructure/kubernetes/dev | grep image:
kubectl kustomize infrastructure/kubernetes/prod | grep image:
```

---

## Infrastructure as Code (Terraform)

`infrastructure/terraform/` contains a validate-only AWS EKS configuration: a VPC
across two Availability Zones (public and private subnets, NAT gateway),
least-privilege IAM roles for the control plane and worker nodes, an EKS cluster,
and an autoscaling managed node group in the private subnets.

Validate it (no AWS account or cost required):

```bash
cd infrastructure/terraform
terraform init
terraform validate
```

It is never applied. To provision for real (incurs cost): set AWS credentials,
`cp terraform.tfvars.example terraform.tfvars`, then `terraform plan` / `apply`,
and `terraform destroy` to tear it down. The `.terraform.lock.hcl` is committed
(pins the provider version); state and real `terraform.tfvars` are gitignored.

---

## AI PR reviewer

`.github/workflows/ai-review.yml` runs on every PR (opened / new commits) into
`dev` and `main`. It sends the PR diff to the Gemini API (`gemini-2.5-flash`,
free tier) and posts the review as a PR comment. It is **advisory and
non-blocking**; it never gates a merge. A fork-safety condition makes the job run
only for same-repo PRs (secrets are not available to forks). Findings are
sometimes context-blind false positives (the model only sees the diff), so treat
them as a second opinion, not gospel.

- Secret: `GEMINI_API_KEY` (free tier, no billing account, cannot be charged).
- If the API returns a transient error (e.g. HTTP 503), the workflow soft-fails
  and posts an informational note instead of breaking the run.

---

## Project board automation

`.github/workflows/add_to_project.yaml` auto-adds new issues to the GitHub
Projects board (`github.com/users/Petar-Dev-Port/projects/1`). The board's
built-in workflows move items between Todo / In Progress / Done. Labels follow a
`type:` / `priority:` / `area:` taxonomy.

- Secret: `ADD_TO_PROJECT_PAT` (classic token with `project` scope, since the
  default `GITHUB_TOKEN` cannot write to user-level projects).

---

## Branch guard: only `dev` can merge into `main`

`.github/workflows/guard-main.yml` runs on every PR targeting `main`. If the PR's
source branch is not `dev`, it auto-closes the PR (and the check goes red on
purpose). PRs from `dev` pass and merge normally. This prevents accidentally
merging a feature branch straight into `main`.

This is a "soft" guard (reacts and closes) rather than branch protection, chosen
because a required-status-check ruleset would block the prod pipeline's direct
commit-back push to `main`. For a future always-on cluster, a protected branch
with a GitHub App on the bypass list is the "proper" upgrade.

---

## Monitoring (Prometheus + Grafana)

The `kube-prometheus-stack` Helm chart is deployed **through ArgoCD** via
`infrastructure/argocd/monitoring-app.yaml` (chart pinned, slim values:
Alertmanager off, small resource requests, short retention) into the `monitoring`
namespace. ArgoCD installs and manages it like any other app.

View Grafana (cluster must be running):

```bash
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80
```

http://localhost:3000, login `admin` / `admin`. Prebuilt Kubernetes dashboards
are under Dashboards (Cluster compute, Namespace pods, Node Exporter).

Notes:
- Monitoring is the heaviest workload in the cluster; it can show `Progressing`
  for a minute after a cold start before going `Healthy`. Normal.
- Confirm it's managed: `kubectl get applications -n argocd` should list
  `monitoring` as Synced/Healthy alongside `portfolio-dev` and `portfolio-prod`.

---

## Ingress (clean URLs via Traefik)

Traefik ships with k3d and acts as the ingress controller. Two Ingress manifests
(`infrastructure/kubernetes/dev/ingress.yaml`, `.../prod/ingress.yaml`) route
`dev.localhost` and `prod.localhost` to the respective services. They are managed
by ArgoCD like everything else.

The one host requirement: host port 80 must reach the cluster's load balancer.

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

## Adding a showcase script

1. Drop the script under `scripts/bash/` or `scripts/python/`.
2. Add one entry to `frontend/src/scripts.js` (id, name, category, language,
   description, repoPath, files). New categories auto-appear as filter chips.
3. Validate the file parses before committing: `node --check frontend/src/scripts.js`.
4. Ship through the normal dev -> main flow.

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

# Helm (for inspecting the monitoring chart; ArgoCD manages it)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Terraform (for the validate-only IaC showcase)
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install -y terraform

# cloudflared (for live demo tunnels)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
```

Reopen the terminal so the docker group applies.

### 3. Create the cluster (once), note port 80 for Ingress

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

### 5. Deploy base manifests once (Kustomize)

```bash
kubectl apply -k infrastructure/kubernetes/dev/
kubectl apply -k infrastructure/kubernetes/prod/
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
kubectl apply -f infrastructure/argocd/monitoring-app.yaml
```

From here ArgoCD owns the deployments; let Git drive.

### 8. Repo secrets (GitHub -> Settings -> Secrets -> Actions)

| Secret | Purpose |
|--------|---------|
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | push images to Docker Hub |
| `GEMINI_API_KEY` | AI PR reviewer |
| `ADD_TO_PROJECT_PAT` | add issues to the Projects board |

---

## Troubleshooting

**`dev.localhost` / `prod.localhost` won't load**
Check `docker ps ... serverlb` shows `0.0.0.0:80->80`. If not, run the
`k3d cluster edit --port-add` command above. Confirm `kubectl get ingress` lists
both hosts. A Traefik 404 means the Ingress isn't matching; a connection refused
means port 80 isn't mapped.

**ArgoCD app `OutOfSync`**
Hit REFRESH on the app card. Auto-sync (`selfHeal`, `prune`) usually corrects it.
After a cold start, `monitoring` may show `Progressing` briefly; give it a minute.

**Merged but new image isn't running**
ArgoCD polls every ~3 min; REFRESH to force. Verify the live pod:
`kubectl get pods` then `kubectl describe pod <new-pod> | grep Image:`.

**AI reviewer didn't comment / posted an error note**
A transient `HTTP 503` from Gemini is soft-failed by design. It reviews again on
the next push. A `400/403` would indicate a key/model issue.

**Cloudflare Tunnel URL loads nothing**
Confirm the cluster is up and `curl -I http://localhost:30081` returns 200 before
starting the tunnel.

**Terraform `validate` fails after editing**
Run `terraform fmt` then re-read the error; it names the exact file and line.
A duplicate-resource error means the same `resource "type" "name"` exists twice.

**Pipeline push rejected: "without `workflow` scope"**
The GitHub token needs the `workflow` scope for `.github/workflows/` changes.

**A PR into main got auto-closed**
That's the guard working: the PR wasn't from `dev`. Merge into `dev` first.

**Recurring conflict on a deployment manifest**
Should no longer happen; image tags live in `kustomization.yaml` now. If a
conflict appears there, take the incoming side; the next pipeline run rewrites it.

**`ImagePullBackOff`**
`kubectl describe pod <pod>` and read Events. Usually a missing tag on Docker Hub.

**`kubectl` can't connect**
Cluster isn't running: `k3d cluster start portfolio`.

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
| Demo URL | `cloudflared tunnel --url http://localhost:30081` (ephemeral) |
| Image tag location | `infrastructure/kubernetes/{dev,prod}/kustomization.yaml` (`newTag`) |
| Deployments | `portfolio-dev`, `portfolio-prod` |
| App manifests | `infrastructure/kubernetes/{dev,prod}/` (Kustomize base) |
| ArgoCD apps | `infrastructure/argocd/{dev,prod,monitoring}-app.yaml` |
| ArgoCD UI | port-forward `svc/argocd-server -n argocd 8080:443` -> https://localhost:8080 |
| Monitoring | `monitoring` namespace; Grafana port-forward `svc/monitoring-grafana -n monitoring 3000:80` (admin/admin) |
| Terraform | `infrastructure/terraform/` (AWS EKS, validate-only) |
| AI reviewer | `.github/workflows/ai-review.yml` (Gemini, advisory) |
| Project board | `github.com/users/Petar-Dev-Port/projects/1` |
| Bootstrap script | `scripts/bash/up.sh` |
| Scripts showcase | `frontend/src/scripts.js` (one entry per script) |
| Secrets | `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `GEMINI_API_KEY`, `ADD_TO_PROJECT_PAT` |

---

## Backlog

- Switch services to ClusterIP (NodePorts are redundant with Ingress; note the
  tunnel currently relies on the prod NodePort, adjust together)
- `scripts.js` `?raw` refactor (import real script files instead of inline strings)
- Remove default Vite asset cruft (`frontend/src/assets/react.svg`)
- Trivy image scanning in CI
- Helm chart authoring for the app
- ArgoCD webhook for instant sync (needs a stable public endpoint)
- OIDC / keyless auth exploration