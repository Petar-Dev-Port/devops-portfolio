# Terraform , AWS EKS (validate-only)

Infrastructure as code for a production-grade Kubernetes platform on AWS:
a VPC across two Availability Zones (public + private subnets, NAT gateway),
least-privilege IAM roles for the control plane and worker nodes, an EKS
cluster, and a managed node group running in the private subnets.

## Status: validate-only

This configuration is **defined and validated, but not applied**. It is
provisionable on demand. The portfolio currently runs locally on k3d and is
demoed via Cloudflare Tunnel, so no AWS resources are billed.

## Validate (no AWS account or cost required)

```bash
terraform init       # downloads the AWS provider
terraform validate   # checks the configuration is valid
terraform fmt -check # checks formatting
```

`validate` does not contact AWS and creates nothing.

## To actually provision (optional, incurs cost)

```bash
aws configure                 # set AWS credentials once
cp terraform.tfvars.example terraform.tfvars
terraform plan                # preview the ~25 resources
terraform apply               # build the cluster
aws eks update-kubeconfig --region eu-central-1 --name portfolio-eks
terraform destroy             # tear it all down, stops billing
```

## What it provisions

- VPC (10.0.0.0/16) across 2 AZs
- 2 public + 2 private subnets, Internet Gateway, NAT Gateway, route tables
- IAM roles: EKS control plane + worker nodes (least privilege)
- EKS cluster (control plane)
- Managed node group (t3.medium, autoscaling 1-3) in private subnets
EOF