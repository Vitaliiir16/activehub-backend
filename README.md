# ActiveHub backend

ActiveHub is a marketplace for sports and active leisure. People find sessions and book places; organizers manage events and subscriptions; administrators manage the platform.

This repository is at the documentation stage. There is no application, database schema, API implementation or runnable Compose configuration yet.

## Stack

The backend will use Node.js, TypeScript and Next.js REST API routes with PostgreSQL. The [frontend](https://github.com/Vitaliiir16/activehub-frontend) is a separate React and TypeScript application. The interface and project documentation will be in English. Prices use UAH and displayed dates use Europe/Kyiv.

## Development plan

Clone both repositories beside each other as `activehub-backend` and `activehub-frontend`. The planned sequence is application scaffolds, infrastructure, the REST contract, then the product features. See the [delivery plan](docs/DELIVERY_PLAN.md) and [current progress](docs/PROGRESS.md).

Once infrastructure is implemented, the target command from this directory will be:

```powershell
docker compose up --build
```

That command is a target, not a working setup today. Compose will start PostgreSQL, migrations and seeds, the API, a worker, the frontend and a local email viewer. Database and uploaded files will use persistent volumes. Required seeds will run automatically; sample data will be optional.

Environment variables, ports, npm scripts and demo credentials will be documented when they exist. No credentials or `.env` files belong in Git. PowerShell development commands must use `npm.cmd` and `npx.cmd`.

## Documentation

- [Requirements](docs/REQUIREMENTS.md) and [verification matrix](docs/REQUIREMENTS_MATRIX.md)
- [Architecture proposal](docs/ARCHITECTURE.md)
- [Decisions and open questions](docs/ASSUMPTIONS.md)
- [Delivery and review workflow](docs/DELIVERY_PLAN.md#delivery-workflow)
- [API change history](docs/API_CHANGELOG.md)

The future API specification will live at `docs/openapi.yaml`. It has not been defined yet. Frontend compatibility will be recorded against exact backend commits.

## Design patterns

No design patterns have been implemented yet. The architecture document explains the proposed GoF patterns and their purpose. As code is added, this section will list the patterns actually used, their source paths and symbols, and a command for finding each implementation. Each implementation will have a short English comment explaining its pattern and role.

## Checks

Current checks cover documentation and repository hygiene only. Application type checks, lint, builds, database integration tests and end-to-end tests are planned. They cannot run until the application and scripts exist.
