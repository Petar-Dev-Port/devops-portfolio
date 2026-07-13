# DevOps Portfolio

A live portfolio site that doubles as a working **GitOps platform**. The site itself is a small React app, but the point of this repo is the infrastructure around it: containerized, deployed to Kubernetes through ArgoCD, with automated CI/CD, monitoring, container security scanning, and an AI-assisted review pipeline, all driven from Git.

> **Note on hosting:** the cluster runs locally on k3d, and live demos are served on-demand through a Cloudflare Tunnel. The infrastructure is real and reproducible; it simply isn't billed to an always-on cloud server. A public URL can be provided on request during a demo.

---

## Architecture

```mermaid
flowchart LR
    Dev[Push to feature branch] --> PR[Pull Request]
    PR -->|Gemini AI review comments| PR
    PR -->|Trivy image scan| PR
    PR --> Merge[Merge to dev / main]
    Merge --> CI[GitHub Actions]
    CI -->|build + push image| Hub[(Docker Hub)]
    CI -->|commit new image tag via Kustomize| Git[(Git repo)]
    Git --> Argo[ArgoCD]
    Argo -->|auto-sync| Cluster[k3d cluster]
    Cluster --> Traefik[Traefik Ingress]
    Traefik --> Site[Portfolio site]
    Tunnel[Cloudflare Tunnel] -->|on-demand demo| Site
```

**The flow:** open a PR, the AI reviewer comments on it and Trivy scans the image, then merge it. GitHub Actions builds a Docker image, pushes it to Docker Hub, and commits the new image tag back into Git (via a Kustomize `images` override). ArgoCD notices the Git change and syncs the cluster. Traefik serves the result. Nothing is deployed by hand.

---

## Tech stack

| Layer | Tooling |
|-------|---------|
| Orchestration | Kubernetes (k3d) |
| GitOps | ArgoCD |
| Manifests | Kustomize |
| Containers | Docker, Docker Hub |
| CI/CD | GitHub Actions |
| IaC | Terraform (AWS EKS, validate-only) |
| Security scanning | Trivy (SARIF to GitHub code scanning) |
| Ingress | Traefik |
| Monitoring | Prometheus + Grafana (kube-prometheus-stack) |
| AI review | Gemini API |
| Frontend | React + Vite, served by nginx |
| Platform | WSL2 (Ubuntu) on Windows |

---

## Environments

Two environments running side by side, promoted through Git:

- **dev** (staging): `dev` branch, http://dev.localhost
- **prod** (production): `main` branch, http://prod.localhost

A branch guard ensures only `dev` can be merged into `main`, so production is always promoted from tested staging code.

---

## Highlights

- **GitOps end to end:** Git is the single source of truth; ArgoCD auto-syncs the cluster with no manual `kubectl apply`.
- **Two-environment promotion:** feature to dev to main, with an automated guard protecting `main`.
- **Kustomize-managed image tags:** the deploy manifest is static; the image tag lives in `kustomization.yaml`, which eliminated a recurring merge-conflict problem.
- **Infrastructure as code:** a full AWS EKS platform (VPC, IAM, cluster, node group) defined in Terraform and validated, provisionable on demand.
- **Image vulnerability scanning:** every PR builds and scans the container image with Trivy; results are published as SARIF to GitHub's code-scanning dashboard, and CRITICAL findings fail the build. Actions are pinned to commit SHAs rather than mutable tags, a deliberate defence against supply-chain tag attacks.
- **Declarative monitoring:** the full Prometheus + Grafana stack is deployed through ArgoCD from a single Application manifest.
- **AI PR reviewer:** a GitHub Action sends each PR diff to the Gemini API and posts an advisory review comment (non-blocking, with fork-safety).
- **Issue to board automation:** new issues are auto-added to a GitHub Projects board with a clean label taxonomy.
- **One-command bootstrap:** `scripts/bash/up.sh` starts Docker and the cluster, waits until pods are actually ready, and prints access URLs.
- **Scripts showcase:** the site renders real automation scripts from a single source-of-truth file.

---

## Repo layout

```
.github/workflows/   CI/CD, AI review, Trivy scanning, branch guard, project automation
frontend/            React + Vite app (Dockerfile + nginx serve it)
infrastructure/
  kubernetes/dev/    dev manifests (Kustomize base)
  kubernetes/prod/   prod manifests (Kustomize base)
  argocd/            ArgoCD Application manifests (dev, prod, monitoring)
  terraform/         AWS EKS infrastructure as code (validate-only)
scripts/             showcased automation scripts (bash, python)
RUNBOOK.md           how to run and operate the platform
```

---

## Running it locally

See [RUNBOOK.md](./RUNBOOK.md) for full setup and daily operation. The short version once set up:

```bash
./scripts/bash/up.sh
```

---

## Infrastructure as Code

The `infrastructure/terraform/` directory defines a production-grade AWS EKS platform as code: a VPC across two Availability Zones (public and private subnets, NAT gateway), least-privilege IAM roles, an EKS cluster, and an autoscaling managed node group in the private subnets. It is validate-only (defined and `terraform validate`-clean, provisionable on demand). The live site runs on local k3d, so no AWS resources are billed.

---

## Security

Every pull request builds the container image and scans it with Trivy. Findings are uploaded in SARIF format and surface in the repository's Security tab under code scanning; CRITICAL vulnerabilities fail the check, while HIGH findings are reported without blocking. Unfixed CVEs are filtered out so that what surfaces is actionable.

Third-party GitHub Actions are pinned to full commit SHAs rather than version tags. This is intentional: the Trivy action was compromised in 2026 via force-pushed version tags, and a SHA cannot be repointed the way a tag can.

---

## Roadmap

- Helm chart authoring for the app
- ArgoCD webhook for instant sync
- OIDC / keyless authentication
- Optional always-on hosting