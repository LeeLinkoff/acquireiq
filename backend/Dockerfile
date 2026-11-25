# Image/container name: acquireiq-backend
# (the name passed to `docker build -t` and `docker run --name`)
#
# Builds and runs the application's API backend. This runs inside
# Docker so the backend has a known, repeatable Node environment
# independent of the host's installed Node version and libraries
# (see ARCHITECTURE_AND_DEPLOYMENT.md).
#
# What happens at build time (`docker build`):
#   1. npm install (full install, including devDependencies, since
#      TypeScript and ts-json-schema-generator need to be present at
#      build time to compile and generate schemas, even though they
#      do not run at container start)
#   2. npm run generate:schemas: regenerates schemas.generated.ts
#      from the actual exported service interfaces, so the OpenAPI
#      spec served at /api/docs can't drift out of sync with the code
#   3. npx tsc: compiles server.ts, swagger-spec.ts, and
#      services/**/*.ts to dist/
#
# What happens at container start:
#   node dist/server.js listens on port 3002 inside the container.
#   Only the compiled output runs, not the .ts source. Node does not
#   execute TypeScript directly without a transpiler at runtime.
#
# How this reaches production:
#   VPS (deploy-to-vps.yml): source is rsynced to the server, this
#   image is built there as acquireiq-backend, and run with:
#
#   docker run -d \
#     --name acquireiq-backend \
#     --restart unless-stopped \
#     --add-host=host.docker.internal:host-gateway \
#     -p 127.0.0.1:3002:3002 \
#     --env-file .env \
#     acquireiq-backend
#
#   Port 3002 is bound to 127.0.0.1 only. Apache's reverse proxy
#   (configured once by hand) forwards /mvps/acquireiq/api/,
#   /requests, /dashboard and /assist/ to it.
#
#   AWS (deploy-to-aws.yml): the image is built on the GitHub runner,
#   pushed to ECR, and run as an ECS Fargate task behind a load
#   balancer.
#
# Rebuilding replaces the image; the old container is removed and a
# new one is created from the new image. The container itself is never
# updated in place.

FROM node:20-alpine

WORKDIR /app

# Full install (not --omit=dev): TypeScript, @types/* packages, and
# schema-generation tooling are devDependencies needed at build time,
# even though they are not needed when the compiled application runs.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Generates schemas.generated.ts from the actual exported service
# interfaces, then compiles server.ts, swagger-spec.ts, and
# services/**/*.ts to dist/.
#
# Order matters: swagger-spec.ts imports schemas.generated.ts, so the
# generated file must exist before tsc runs, not after.
RUN npm run generate:schemas && npx tsc

EXPOSE 3002

# Runs the compiled output, not the TypeScript source directly, since
# Node cannot execute .ts files without a transpiler at runtime.
CMD ["node", "dist/server.js"]