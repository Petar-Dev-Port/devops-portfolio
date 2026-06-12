# RUNBOOK — devops-portfolio

Operational guide for running the portfolio site locally on Windows 10 (WSL2 + Docker + k3d + Kubernetes).

## Architecture in one paragraph

Nothing critical lives on the local machine. Source code lives on GitHub (`Petar-Dev-Port/devops-portfolio`, **`dev` branch**). The built website is a Docker image on Docker Hub (`petarpdev/devops-portfolio:dev-latest`). The local machine just runs them: a k3d cluster (Kubernetes inside Docker, inside WSL) pulls the image and serves it on `localhost:30080`.

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

No `apply` or `create` needed day to day — the cluster remembers everything.
Only `kubectl apply -f ...` after you change a manifest:

```bash
kubectl apply -f infrastructure/kubernetes/dev/
kubectl apply -f infrastructure/kubernetes/prod/
kubectl get pods -w
```

Wait for `Running`, press `Ctrl+C`, open the browser.

## Daily shutdown (optional)

```bash
k3d cluster stop portfolio
```

Optionally also `sudo service docker stop` to free resources.
(A "triggering units still active: docker.socket" message is normal, not an error.)

## When to use what

- **Editing code, quick look** → `npm run dev` (no cluster needed)
- **Verify the deployed container / screenshot dev+prod** → start the cluster
- **Pulled a new image after a merge** → `kubectl rollout restart deployment portfolio-dev` (or `-prod`)

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

> **Trap:** `git clone` drops you on `main`, which only has the README. All real work is on `dev`. Always `git checkout dev`.

### 5. Deploy

```bash
kubectl apply -f infrastructure/kubernetes/dev/
kubectl apply -f infrastructure/kubernetes/prod/
kubectl get pods -w
```

---

## Deploy a code change

Workflow after editing files in `frontend/`:

```bash
cd ~/devops-portfolio
git add .
git commit -m "describe the change"
git push                       # triggers GitHub Actions -> builds & pushes image to Docker Hub
```

Wait for the green check at <https://github.com/Petar-Dev-Port/devops-portfolio/actions>, then pull the new image into the cluster:

```bash
kubectl rollout restart deployment portfolio-dev
kubectl get pods -w
```

---

## Troubleshooting

**Pod stuck on `ImagePullBackOff` / `ErrImagePull`**
The cluster can't pull the image. Check the events:

```bash
kubectl describe pod <pod-name>
```

Look at the `Events` section at the bottom. Usually means the image tag is missing on Docker Hub or there's no network. Confirm the image exists at <https://hub.docker.com/r/petarpdev/devops-portfolio>.

**`kubectl` can't connect to the cluster**
The cluster isn't running. `k3d cluster start portfolio`.

**Docker commands fail with permission denied**
Docker isn't started or the group didn't apply. `sudo service docker start`, and reopen the terminal.

**Site doesn't load at localhost:30080**
Check the pod is `Running` (`kubectl get pods`) and the service exists (`kubectl get svc`). The cluster must have been created with `--port "30080:30080@loadbalancer"`.

---

## Key facts

| Item | Value |
|------|-------|
| GitHub repo | `Petar-Dev-Port/devops-portfolio` |
| Working branch | `dev` |
| Docker Hub image | `petarpdev/devops-portfolio:dev-latest` |
| Cluster name | `portfolio` |
| Local URL | <http://localhost:30080> |
| Deployment | `portfolio-dev` |
| Service | `portfolio-dev-service` (port 30080) |
| Manifests | `infrastructure/kubernetes/dev/` |