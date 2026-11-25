# ============================================================
# AcquireIQ on AWS
#
# Creates everything needed to run the app:
#   CloudFront (HTTPS entry point)
#     -> S3 bucket for the React frontend
#     -> Application Load Balancer for API paths   (public subnets)
#          -> ECS Fargate task running the backend (public or private subnets)
#               -> RDS PostgreSQL                  (private subnets)
#
# Normally applied by .github/workflows/deploy-to-aws.yml.
# Prerequisite: infra/bootstrap applied once (state bucket, ECR
# repositories, GitHub deploy role).
#
# To run by hand from this folder instead:
#   terraform init -backend-config="bucket=<tf_state_bucket output from bootstrap>"
#   terraform plan
#   terraform apply
# Secret values come from TF_VAR_* environment variables or a
# terraform.tfvars file, which must never be committed.
# ============================================================

terraform {
  required_version = ">= 1.10"

  # State lives in the bootstrap bucket, passed at init time with
  # -backend-config="bucket=...". use_lockfile stops two applies
  # from running at once (needs Terraform 1.10+).
  backend "s3" {
    key          = "acquireiq/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }

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

# ------------------------------------------------------------
# Variables
# ------------------------------------------------------------

# AWS region for every resource.
variable "region" {
  default = "us-east-1"
}

# Prefix used in resource names.
variable "app" {
  default = "acquireiq"
}

# Image tag ECS runs, for both the backend and db-init images.
# The workflow passes the git commit SHA.
variable "image_tag" {
  default = "latest"
}

# Password for the RDS "postgres" admin user. Used only by the
# db-init task, never by the app.
variable "db_master_password" {
  type      = string
  sensitive = true
}

# Password for the acquireiq_app role the backend connects as.
# The db-init task sets the role to this password.
variable "db_app_password" {
  type      = string
  sensitive = true
}

# OpenAI key for natural-language search.
variable "openai_api_key" {
  type      = string
  sensitive = true
}

# Address range for the app's own VPC.
variable "vpc_cidr" {
  default = "10.20.0.0/16"
}

# false: backend tasks run in the public subnets with a public IP,
#        locked down by their security group. No NAT cost.
# true:  backend tasks run in the private subnets and reach the
#        internet (OpenAI, ECR, Secrets Manager) through a NAT
#        gateway. More isolated, but NAT has an hourly charge.
variable "use_nat_gateway" {
  type    = bool
  default = false
}

# ------------------------------------------------------------
# Network
# A dedicated VPC across two Availability Zones:
#   public subnets  - load balancer (and backend tasks unless
#                     use_nat_gateway is true); route to the internet
#   private subnets - database (and backend tasks when
#                     use_nat_gateway is true); no inbound route
#                     from the internet at all
# ------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # Where backend and db-init tasks run, and whether they need a
  # public IP to reach the internet.
  task_subnets   = var.use_nat_gateway ? aws_subnet.private[*].id : aws_subnet.public[*].id
  task_public_ip = !var.use_nat_gateway
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.app }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = var.app }
}

# 10.20.0.0/24 and 10.20.1.0/24 with the default range.
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  tags              = { Name = "${var.app}-public-${local.azs[count.index]}" }
}

# 10.20.10.0/24 and 10.20.11.0/24 with the default range.
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  tags              = { Name = "${var.app}-private-${local.azs[count.index]}" }
}

# Public subnets send internet traffic to the internet gateway.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app}-public" }

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private subnets have no internet route unless NAT is enabled.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app}-private" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Optional NAT gateway, only when use_nat_gateway is true. One
# NAT in the first AZ keeps cost down; it is a single point of
# failure for outbound traffic from the private subnets.
resource "aws_eip" "nat" {
  count  = var.use_nat_gateway ? 1 : 0
  domain = "vpc"
  tags   = { Name = "${var.app}-nat" }
}

resource "aws_nat_gateway" "main" {
  count         = var.use_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = var.app }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route" "private_nat" {
  count                  = var.use_nat_gateway ? 1 : 0
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[0].id
}

# AWS-managed list of CloudFront's outbound IP ranges. Used so
# only CloudFront can reach the load balancer.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# ------------------------------------------------------------
# Security groups
# Each layer accepts traffic only from the layer in front of it:
# CloudFront -> ALB (80) -> ECS (3002) -> RDS (5432)
# ------------------------------------------------------------

# Load balancer: HTTP from CloudFront only.
resource "aws_security_group" "alb" {
  name   = "${var.app}-alb"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Backend tasks: port 3002 from the load balancer only. Outbound
# is open so tasks can pull the image and call OpenAI.
resource "aws_security_group" "ecs" {
  name   = "${var.app}-ecs"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 3002
    to_port         = 3002
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Database: Postgres from the backend tasks only.
resource "aws_security_group" "db" {
  name   = "${var.app}-db"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}

# ------------------------------------------------------------
# Database (RDS PostgreSQL)
# Private subnets, single-AZ, smallest Graviton instance. AWS
# picks which of the two AZs it runs in. The schema is
# created by the db-init ECS task (see infra/db-init), which the
# workflow runs on every deploy.
# ------------------------------------------------------------

resource "aws_db_subnet_group" "db" {
  name       = var.app
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "db" {
  identifier             = var.app
  engine                 = "postgres"
  engine_version         = "17"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  username               = "postgres"
  password               = var.db_master_password
  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  # Demo setting: terraform destroy deletes the data with no
  # backup. Set to false and add final_snapshot_identifier for
  # anything real.
  skip_final_snapshot = true
}

# ------------------------------------------------------------
# Secrets Manager
# ECS reads these at container start and passes them in as
# environment variables, so they never appear in the task
# definition or the image.
# ------------------------------------------------------------

# recovery_window_in_days = 0 deletes secrets immediately on
# destroy, so a later apply can recreate the same names.
#
# RDS requires TLS. sslmode=no-verify encrypts the connection but
# skips certificate checks. Switch to the RDS CA bundle later.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.app}/DATABASE_URL"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://acquireiq_app:${var.db_app_password}@${aws_db_instance.db.address}:5432/acquireiq?sslmode=no-verify"
}

resource "aws_secretsmanager_secret" "openai" {
  name                    = "${var.app}/OPENAI_API_KEY"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "openai" {
  secret_id     = aws_secretsmanager_secret.openai.id
  secret_string = var.openai_api_key
}

# Used only by the db-init task.
resource "aws_secretsmanager_secret" "db_master_password" {
  name                    = "${var.app}/DB_MASTER_PASSWORD"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db_master_password" {
  secret_id     = aws_secretsmanager_secret.db_master_password.id
  secret_string = var.db_master_password
}

resource "aws_secretsmanager_secret" "db_app_password" {
  name                    = "${var.app}/DB_APP_PASSWORD"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db_app_password" {
  secret_id     = aws_secretsmanager_secret.db_app_password.id
  secret_string = var.db_app_password
}

# ------------------------------------------------------------
# Container registries (ECR)
# Created by infra/bootstrap so the workflow can push images
# before this apply runs. Looked up here by name.
# ------------------------------------------------------------

data "aws_ecr_repository" "backend" {
  name = "${var.app}-backend"
}

data "aws_ecr_repository" "db_init" {
  name = "${var.app}-db-init"
}

# ------------------------------------------------------------
# IAM
# Role ECS uses to start tasks: pull from ECR, write logs, and
# read only the secrets above.
# ------------------------------------------------------------

resource "aws_iam_role" "task_exec" {
  name = "${var.app}-task-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# AWS-managed policy covering ECR pulls and CloudWatch logs.
resource "aws_iam_role_policy_attachment" "task_exec" {
  role       = aws_iam_role.task_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "read_secrets" {
  role = aws_iam_role.task_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = [
        aws_secretsmanager_secret.database_url.arn,
        aws_secretsmanager_secret.openai.arn,
        aws_secretsmanager_secret.db_master_password.arn,
        aws_secretsmanager_secret.db_app_password.arn,
      ]
    }]
  })
}

# ------------------------------------------------------------
# Backend (ECS Fargate)
# ------------------------------------------------------------

# Container stdout/stderr, kept 14 days.
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.app}-backend"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "main" {
  name = var.app
}

# What to run: the backend image with 0.25 vCPU and 512 MB,
# listening on 3002, with config from env vars and secrets.
resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.app}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_exec.arn

  container_definitions = jsonencode([{
    name         = "backend"
    image        = "${data.aws_ecr_repository.backend.repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3002 }]
    environment = [
      { name = "PORT", value = "3002" },
      { name = "OPENAI_MODEL", value = "gpt-5.4-mini" },
      { name = "LOG_LEVEL", value = "none" }
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "backend"
      }
    }
  }])
}

# One-off task that creates or updates the schema. Not a service:
# the workflow starts it with aws ecs run-task and waits for it
# to exit. Runs in the ECS security group so RDS accepts it.
resource "aws_cloudwatch_log_group" "db_init" {
  name              = "/ecs/${var.app}-db-init"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "db_init" {
  family                   = "${var.app}-db-init"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_exec.arn

  container_definitions = jsonencode([{
    name      = "db-init"
    image     = "${data.aws_ecr_repository.db_init.repository_url}:${var.image_tag}"
    essential = true
    environment = [
      { name = "PGHOST", value = aws_db_instance.db.address },
      { name = "PGUSER", value = "postgres" },
      { name = "PGSSLMODE", value = "require" }
    ]
    secrets = [
      { name = "PGPASSWORD", valueFrom = aws_secretsmanager_secret.db_master_password.arn },
      { name = "DB_APP_PASSWORD", valueFrom = aws_secretsmanager_secret.db_app_password.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.db_init.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "db-init"
      }
    }
  }])
}

# Application Load Balancer in front of the tasks. Reached only
# by CloudFront, so plain HTTP is fine here; viewers get HTTPS
# from CloudFront.
resource "aws_lb" "main" {
  name               = var.app
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]
}

# Fargate tasks register by IP. Unhealthy tasks are replaced if
# /api/health stops answering.
resource "aws_lb_target_group" "backend" {
  name        = "${var.app}-backend"
  port        = 3002
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  # Checks /api/health every 30 seconds. Two failures in a row
  # mark the task unhealthy; ECS then replaces it. Five passes in
  # a row mark a new task healthy.
  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    unhealthy_threshold = 2
    healthy_threshold   = 5
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# Keeps one backend task running and registered with the ALB.
# Without NAT, tasks sit in the public subnets and need a public
# IP to pull the image and reach OpenAI; their security group
# still only accepts traffic from the load balancer. With NAT,
# they sit in the private subnets with no public IP.
resource "aws_ecs_service" "backend" {
  name            = "${var.app}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.task_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = local.task_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3002
  }

  depends_on = [aws_lb_listener.http]
}

# ------------------------------------------------------------
# Frontend (S3 + CloudFront)
# The React build is uploaded to s3://<bucket>/acquireiq/ to
# match the Vite base path. The bucket is private; only this
# CloudFront distribution can read it.
# ------------------------------------------------------------

# bucket_prefix gives a globally unique name. force_destroy lets
# terraform destroy remove it even when it contains files.
resource "aws_s3_bucket" "frontend" {
  bucket_prefix = "${var.app}-frontend-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lets CloudFront sign its requests to the private bucket.
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.app}-frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed CloudFront policies, looked up by name.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards headers, cookies and query strings to the API, but
# not the Host header, so the ALB sees its own hostname.
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewerExceptHostHeader"
}

# One HTTPS address for everything. Static files come from S3
# (cached). API paths go to the ALB (never cached). Because the
# browser sees one origin, there are no CORS or mixed-content
# problems.
resource "aws_cloudfront_distribution" "main" {
  enabled = true

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.main.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Everything not matched below: frontend files from S3.
  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  # Backend routes, matching backend/src/routes. Add a pattern
  # here if a new top-level route is added to the backend.
  dynamic "ordered_cache_behavior" {
    for_each = ["/api/*", "/requests*", "/dashboard*", "/assist/*"]
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "alb"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Default *.cloudfront.net certificate. Replace with an ACM
  # certificate and add aliases to use your own domain.
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Allows reads from the bucket only by this distribution.
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn } }
    }]
  })
}

# ------------------------------------------------------------
# Outputs, printed after apply. View again with:
#   terraform output
# The workflow reads most of these to run later steps.
# ------------------------------------------------------------

# Address to open the app in a browser.
output "app_url" {
  value = "https://${aws_cloudfront_distribution.main.domain_name}/acquireiq/"
}

# Where the backend image is pushed.
output "ecr_repository_url" {
  value = data.aws_ecr_repository.backend.repository_url
}

# Where to upload the frontend build.
output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

# Database host.
output "db_endpoint" {
  value = aws_db_instance.db.address
}

# Used by the workflow to run the db-init task and wait on the service.
output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.backend.name
}

output "db_init_task_definition" {
  value = aws_ecs_task_definition.db_init.arn
}

output "ecs_subnets" {
  value = join(",", local.task_subnets)
}

# ENABLED or DISABLED, for the db-init task's network settings.
output "ecs_assign_public_ip" {
  value = local.task_public_ip ? "ENABLED" : "DISABLED"
}

output "ecs_security_group" {
  value = aws_security_group.ecs.id
}

# Used by the workflow to clear the cache after a frontend upload.
output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}
