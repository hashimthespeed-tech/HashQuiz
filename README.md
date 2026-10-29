# Hosh Quiz

A quiz and study app for a high school web design project.

Built with Node.js 24, Express 5, PostgreSQL, and plain HTML, CSS, and JavaScript.
See [the development plan](docs/PLAN.md) for the phased Git workflow and requirements.

Players can explore five quizzes, receive immediate answer explanations, retry, review their own history, compare leaderboard results, and study with ungraded flashcards. Teachers can edit and reassign questions and preview/validate/import CSV files.

The initial topics are Basketball, Football (soccer), Business, Sales, and Networking. Networking means professional relationship-building in the context of the spec's business/sales audience. Each topic has ten original questions with four choices and one correct answer.

All five implementation phases have separate retained branches. Their tested changes are merged into `main`. See [verification](docs/VERIFICATION.md) and the [Replit deployment handoff](docs/DEPLOYMENT.md).

## Development

Requires Node.js 24 and PostgreSQL. Install with `npm ci`.

For a local PostgreSQL instance, run `npm run db:local` and keep it running. This creates a persistent, loopback-only database and an ignored `.env` if one does not already exist. In another terminal:

```sh
npm run db:migrate
npm run db:seed
npm start
```

For an existing PostgreSQL service, copy `.env.example` to `.env`, supply your `DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters, then use the same migration/start commands. Secrets must not be committed. Migration commands apply pending additive SQL files in order; review the files before running against a non-local database.

Provision the teacher account by setting `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, and optionally `INITIAL_ADMIN_EMAIL` in the environment, then running `npm run db:admin`. Existing players cannot be silently promoted. Remove the provisioning password afterward.

## Checks

`npm run test:local` starts a separate disposable PostgreSQL instance, runs the API integration checks, and removes that test database. It does not use or erase the development database. To test a separately provisioned empty database, set `TEST_DATABASE_URL` (database name must end in `_test`) and run `npm test`.

With the app running, `node scripts/smoke.js` performs a brief Chromium browser check. Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. Local screenshots are written to ignored `test-results/`.

`node scripts/smoke-admin.js` checks the teacher editor and CSV preview/import using a temporary synthetic teacher. It only runs against a local server and local database. The downloadable CSV template is at `public/question-template.csv`; valid rows import only after the teacher confirms the preview. Every quiz retains at least ten questions.

## Project map

- `public/`: static SPA, hash routing, styles, and CSV template.
- `src/`: Express routes, authentication, authorization, and database operations.
- `migrations/`: ordered additive PostgreSQL schema migrations.
- `data/quizzes.js`: the original five-topic question bank.
- `scripts/`: migrations, seeding, admin provisioning, local database, and brief browser checks.
- `test/integration.test.js`: integration checks against real, isolated PostgreSQL.
- `docs/`: phase plan, actual verification results, and deployment instructions.
