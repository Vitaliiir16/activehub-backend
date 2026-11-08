# ActiveHub backend

ActiveHub is a sports and active-leisure marketplace. This repository provides the Next.js REST scaffold, PostgreSQL bootstrap, required reference data and local container infrastructure. The only implemented HTTP endpoint is `GET /api/health`. Accounts, catalog, bookings, payments and background business jobs are planned.

## Run locally

Install Node.js 24 and Docker Desktop with its Linux engine running. Clone [activehub-frontend](https://github.com/Vitaliiir16/activehub-frontend) beside this repository, using the directory names `activehub-backend` and `activehub-frontend`. From this directory:

```powershell
node scripts/create-local-env.mjs
docker compose up --build --wait
```

The first command creates `.env` with random local passwords and refuses to overwrite an existing file. Review it privately to choose the initial administrator email and name. Alternatively copy `.env.example` to `.env` and replace both password placeholders. Never commit this file. After initial configuration, `docker compose up --build --wait` is the complete startup command.

Open the frontend at <http://localhost:8080>, API readiness at <http://localhost:3000/api/health>, and Mailpit at <http://localhost:8025>. The administrator is seeded, but sign-in is not implemented. There are no demo accounts or events yet. All UI text and seeds are English; future money uses UAH and displayed dates use Europe/Kyiv.

Compose waits for PostgreSQL, runs migrations and seeds to completion, then starts the API and worker. The frontend waits for API readiness. The worker also waits for Mailpit and currently only checks connectivity and maintains a heartbeat; it sends no email and runs no product jobs. SIGTERM closes its database connections. It restarts after unexpected failure. Mailpit captures local mail without outbound SMTP configuration.

Named volumes preserve PostgreSQL data, uploads and mail. PostgreSQL 18 uses `/var/lib/postgresql`. `docker compose stop` stops services; repeat startup to resume. `docker compose down` removes this project's containers while retaining volumes. Do not use `down --volumes` or pruning against data you need.

## Configuration

| Variable | Purpose |
|---|---|
| `COMPOSE_PROJECT_NAME` | Container and volume namespace; default activehub |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Bootstrap database credentials; changing them does not rewrite an existing volume |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME` | Required bootstrap administrator; repeated initialization preserves existing credentials/profile |
| `API_PORT`, `FRONTEND_PORT`, `MAILPIT_PORT` | Localhost ports; defaults 3000, 8080 and 8025 |
| `DATABASE_URL` or standard `PG*` variables | Database connection for commands outside Compose |
| `API_PROXY_TARGET` | Frontend Vite development proxy target, configured in the frontend |

The initial password requires 8-256 characters, a letter and a digit. It is stored as a salted scrypt hash. Once a system-created administrator exists, changing bootstrap configuration does not create another administrator or reset credentials. Required seeds insert missing dictionaries and loyalty defaults, preserving subsequent edits. Migrations run transactionally under an advisory lock and reject changes to applied SQL; add a new migration instead. Demo seeds are deferred with the business modules; `SEED_DEMO=true` is explicitly rejected.

## Development and checks

Use `npm.cmd` and `npx.cmd` in PowerShell (`npm` and `npx` in other shells):

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
docker compose run --rm --no-deps migrate node --import tsx scripts/verify-db.ts
```

The database check needs the running Compose database. It verifies seed identities/defaults, password hashing, repeat initialization and preservation of edits; test mutations are rolled back. `npm.cmd run test:health` checks a running API (`API_BASE_URL` defaults to `http://127.0.0.1:3000`). `npm.cmd run test:smoke` starts a built server on port 3100 and needs real database variables in the shell. `npm.cmd run dev` starts Next.js on port 3000 with the same requirement. Compose deliberately does not publish the database port; use container commands.

Exact dependencies and image digests are pinned. Node 24, Next.js 16, TypeScript 5.9 and PostgreSQL 18 are the baseline. TypeScript stays within the lint tool's supported range. Targeted ESLint dependency overrides replace affected development-only minimatch versions; both dependency audits were clean at verification time.

## Documentation

- [Requirements](docs/REQUIREMENTS.md), [matrix](docs/REQUIREMENTS_MATRIX.md) and [delivery plan](docs/DELIVERY_PLAN.md)
- [Current evidence](docs/PROGRESS.md) and [open decisions](docs/ASSUMPTIONS.md)
- [System models](docs/MODELING.md) and [architecture](docs/ARCHITECTURE.md)

Q-01 through Q-05 remain open. Infrastructure does not approve those proposals. Current checks cover scaffolding and bootstrap only; there is no business integration coverage.

## Design patterns

No GoF pattern is implemented yet. [ARCHITECTURE.md](docs/ARCHITECTURE.md) explains proposed patterns and interactions. As modules are added, this index will identify each implemented pattern, purpose, source symbol and search command. Implementations will carry a concise English pattern comment.
