# Replit handoff

The app is implemented and tested locally. Replit QA and production deployment were left to the student. No production service or production database was accessed during development.

## Development workspace

1. Import `hashimthespeed-tech/HashQuiz` and select `main`.
2. Use Node.js 24 LTS. Install dependencies with `npm ci`.
3. Create or select the **development** PostgreSQL database. Put its connection string in the Replit secret named `DATABASE_URL`.
4. Add a random `SESSION_SECRET` of at least 32 characters in Secrets. Set `NODE_ENV=development`. Do not paste these values into code or commit an `.env` file.
5. Review the SQL files in `migrations/`, then run `npm run db:migrate` and `npm run db:seed` against that development database.
6. Set `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD` securely. Optionally set `INITIAL_ADMIN_EMAIL`; otherwise an internal `username@admin.local` address is used. Run `npm run db:admin`, then remove `INITIAL_ADMIN_PASSWORD`. Public registration always creates a player.
7. Set the workspace Run command to `npm run dev` or `npm start`. The app serves both static pages and API routes on `0.0.0.0` and uses `PORT`, defaulting to 3000.
8. Check `/api/health`, register a player, finish a quiz, and confirm history after logging out and in. Log in with the teacher account and check the question editor and CSV preview.

The local helper `npm run db:local` is only for machines without a provided PostgreSQL service. Replit should use its own database via `DATABASE_URL`.

## Production deployment

Use a **separate production PostgreSQL database** and a separate random `SESSION_SECRET`. Never point production at the development database or copy the development fixture accounts into production.

- Runtime: Node.js 24 LTS.
- Install/build command: `npm ci --omit=dev`. There is no frontend compilation step.
- Run command: `npm start`.
- Environment: `NODE_ENV=production`, production `DATABASE_URL`, production `SESSION_SECRET`, and `APP_ORIGIN` set to the final HTTPS origin (for example `https://your-app.replit.app`, without a trailing slash). Use the platform-provided `PORT`.
- Database preparation: inspect and run `npm run db:migrate`, then `npm run db:seed` on the production database before starting the deployment. These commands are explicit, not automatically run by the web server. Existing quiz edits are preserved by seeding.
- Provision the production admin through the same secure environment-variable procedure. Do not reuse a classroom/test password.
- The app trusts one reverse proxy hop and enables Secure, HttpOnly, SameSite=Lax session cookies in production. Serve it through HTTPS and keep database TLS verification enabled; use your provider's supported connection string and certificate configuration.

After you deploy, make a non-destructive check of the home page and `/api/health`, and verify sign-in using an intended account. Local test results are not a claim that Replit deployment has been performed or verified.

## Persistence and content

Users, session state, quiz content, completed attempts, and CSV preview transactions are stored in PostgreSQL. Restarting the Node server preserves them. Official quiz sessions expire after 24 hours if unfinished; CSV previews expire after one hour. Completed attempts remain in history.

The initial bank has five collections and 50 questions. An official attempt uses the first ten questions in the selected collection; flashcards show the entire collection. Teacher edits apply to newly started quizzes. An in-progress attempt keeps its original question/answer snapshot.

The downloadable CSV template includes one example question. Remove or replace that row before uploading your own bank. Invalid rows are shown before import; confirming imports the valid rows exactly once. Correct and re-upload only rejected rows to avoid adding duplicate questions in a new import.

## Troubleshooting

- `DATABASE_URL is required` / connection refused: check the database binding and availability. On this cloud machine, start `npm run db:local` in a separate terminal if using the local database.
- Missing relations: run the migrations against the same database used by the server.
- Empty catalog: run `npm run db:seed` against that database.
- Authentication cookie fails in production: use the HTTPS deployment URL, check `NODE_ENV` and proxy settings, and keep `SESSION_SECRET` consistent across restarts/instances.
- Cross-origin request rejected: set `APP_ORIGIN` to the exact origin serving the application. Frontend and API belong on the same server.
- A question cannot move or be deleted: add another valid question first so the original quiz retains ten questions.

Do not run the automated browser smoke scripts against production. The teacher smoke script intentionally uses only a local database and a temporary synthetic teacher account.
