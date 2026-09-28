# SMW API

NestJS backend API for SMW Music Academy.

**Runtime: Node.js + Yarn, tests: Vitest** — see [docs/runtime/node-yarn-vitest-architecture.md](docs/runtime/node-yarn-vitest-architecture.md)
for the runtime contract, build-boundary notes, and the runtime integrity gate.

```bash
yarn install --frozen-lockfile
yarn start:dev
yarn test
```

## Quick Start

```bash
# Install dependencies from the committed lockfile
yarn install --frozen-lockfile

# Start the development server
yarn start:dev
```

The repository runtime contract is:

- Package manager: Yarn 1 (`yarn.lock` is the canonical lockfile)
- Local runtime: Node.js
- Container runtime: Node.js via [`Dockerfile`](./Dockerfile)
- Test runner: Vitest

## Common Commands

```bash
# Lint, test, and build
yarn lint
yarn test
yarn build

# Database helpers
yarn migration:show
yarn migration:run
yarn migration:revert
yarn schema:sync
```

## API Endpoints

- **Hello API**: `GET /` - Welcome message
- **Health Check**: `GET /health` - API health status

## Database Migrations

**Always use TypeORM migrations for database changes. Never create tables manually.**

```bash
# Show migration status
yarn migration:show

# Run pending migrations
yarn migration:run

# Generate new migration (after entity changes)
yarn migration:generate src/migrations/MigrationName

# Revert last migration
yarn migration:revert
```

## Environment

Copy `.env.example` to `.env` and configure your database settings.

## Production

Production deploys still use the existing GitHub Actions workflows, and the built container stays on the existing Node.js runtime.

```bash
# Build the production image locally
docker build -t smw-api:local .

# Run the API container
docker run --rm -p 3000:3000 --env-file .env smw-api:local
```

The container entrypoint performs the same sequence the team already expects:

```bash
yarn build && yarn migration:run && yarn start:prod
```
