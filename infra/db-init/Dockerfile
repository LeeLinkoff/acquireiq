# One-off database setup image. The deploy-to-aws workflow runs
# it as an ECS task inside the VPC, since RDS is not reachable
# from GitHub's runners. Build from the repository root:
#   docker build -f infra/db-init/Dockerfile .
FROM postgres:17-alpine

COPY backend/scripts/setup-database.sql /setup-database.sql
COPY infra/db-init/init.sh /init.sh

ENTRYPOINT ["/bin/sh", "/init.sh"]
