# Verification record

Checks run locally with Node.js 24, real PostgreSQL, and headless system Chromium. Replit and production checks are outside this task, per student instruction. Each phase is pushed, merged using ordinary Git, and compared with remote main before continuing. No GitHub pull request was available because the GitHub API returned Forbidden.

## Phase 1 — Foundation and authentication

- `npm run test:local`: 6 passed, 0 failed, 0 skipped. Covers static serving/database health, bcrypt cost 12, registration and invalid inputs, duplicate users, session cookies, failed login, cross-origin rejection, role restrictions, persisted sessions across app instances, and logout.
- `node scripts/smoke.js`: browser registration, session after reload, logout, and 390px viewport check passed; no JavaScript page errors.
- Reviewed the desktop login screenshot. All generated accounts are synthetic local test data.

## Phase 2 — Quiz engine

- `npm run test:local`: 9 passed, 0 failed, 0 skipped, including all phase 1 checks. New checks cover repeatable 5-quiz/50-question seeding, four choices/one correct answer, hidden keys, attempt ownership, foreign choices, question order, answer locking, incomplete submissions, an 8/10 result of 80%, idempotent completion, and fresh retries.
- `node scripts/smoke.js`: completed a full quiz in Chromium, reloaded midway, viewed results, and retried; authentication/mobile checks still passed with no page errors.
- Reviewed the catalog screenshot. Explanations and flashcard UI remain scheduled for phase 5.

## Phase 3 — Attempts and personal history

- `npm run test:local`: 12 passed, 0 failed, 0 skipped. Added checks for private completed-only history, retry persistence, concurrent repeat-completion idempotency, and history after logout/login and application recreation.
- `node scripts/smoke.js`: full quiz and retry followed by personal history, exactly one completed row despite starting an unfinished retry, and history after reload passed. Prior browser/auth checks still pass.
- Migration 003 preserves already completed phase-2 results; new results and completed-attempt inserts use one transaction.

## Phase 4 — Leaderboards and teacher tools

- `npm run test:local`: 18 passed, 0 failed, 0 skipped. New checks cover grouped highest scores, completed counts, both tie rules, absence of emails, player denial for every admin operation, question validation/reassignment/deletion, the ten-question minimum, in-flight question snapshots, CSV preview without writes, per-row errors, partial import, and idempotent import.
- Player browser smoke passed through topic leaderboards as well as all earlier flows.
- `node scripts/smoke-admin.js`: teacher add/edit/reassign/delete and CSV preview with one valid and one invalid row, explicit import, and mobile width all passed with no page errors.
- The browser check found and verified fixes for editor field labels and a hidden table caption causing mobile overflow. Synthetic question fixtures were removed afterward.
