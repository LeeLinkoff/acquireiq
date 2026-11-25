# ============================================================
# AcquireIQ AWS bootstrap. Run ONCE from your PC with admin
# credentials, before the deploy-to-aws workflow can run.
#
# Creates what the workflow needs but cannot create for itself:
#   - S3 bucket that stores the main Terraform state
#   - ECR repositories the workflow pushes images to
#   - GitHub OIDC provider + IAM role the workflow logs in with
#     (no AWS keys stored in GitHub)
#
# Usage, from infra/bootstrap:
#   terraform init
#   terraform apply
# Then copy the outputs into GitHub repository secrets.
#
# State for this folder stays local (terraform.tfstate here).
# It holds no secrets, but keep it; it is needed to change or
# remove these resources later.
# ============================================================

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  default = "us-east-1"
}

variable "app" {
  default = "acquireiq"
}

# Only workflows from this repo's main branch may assume the role.
variable "github_repo" {
  default = "LeeLinkoff/acquireiq"
}

# ------------------------------------------------------------
# Terraform state bucket
# Versioned so a bad apply can be rolled back. prevent_destroy
# stops an accidental terraform destroy from wiping state.
# ------------------------------------------------------------

resource "aws_s3_bucket" "tfstate" {
  bucket_prefix = "${var.app}-tfstate-"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ------------------------------------------------------------
# Container registries
# Live here, not in ../main.tf, so the workflow can push images
# before the main apply references them.
# ------------------------------------------------------------

# Backend API image, built from backend/Dockerfile.
resource "aws_ecr_repository" "backend" {
  name         = "${var.app}-backend"
  force_delete = true
}

# One-off database setup image, built from infra/db-init/Dockerfile.
resource "aws_ecr_repository" "db_init" {
  name         = "${var.app}-db-init"
  force_delete = true
}

# ------------------------------------------------------------
# GitHub Actions login (OIDC)
# GitHub issues a short-lived token per run; AWS trades it for
# temporary credentials for the role below.
#
# An AWS account can have only one provider for this URL. If
# apply fails because it already exists, import it instead:
#   terraform import aws_iam_openid_connect_provider.github <its ARN>
# ------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github_deploy" {
  name = "${var.app}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/main"
        }
      }
    }]
  })
}

# Terraform creates IAM roles, networking, RDS and more, so the
# deploy role needs broad rights. Narrow this to the specific
# services in ../main.tf before treating it as production.
resource "aws_iam_role_policy_attachment" "github_deploy" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ------------------------------------------------------------
# Outputs. Add these as GitHub repository secrets.
# ------------------------------------------------------------

# GitHub secret TF_STATE_BUCKET
output "tf_state_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}

# GitHub secret AWS_ROLE_ARN
output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}
