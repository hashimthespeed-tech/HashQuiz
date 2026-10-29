# Verification record

Checks run locally with Node.js 24, real PostgreSQL, and headless system Chromium. Replit and production checks are outside this task, per student instruction. Each phase is pushed, merged using ordinary Git, and compared with remote main before continuing. No GitHub pull request was available because the GitHub API returned Forbidden.

## Phase 1 — Foundation and authentication

- `npm run test:local`: 6 passed, 0 failed, 0 skipped. Covers static serving/database health, bcrypt cost 12, registration and invalid inputs, duplicate users, session cookies, failed login, cross-origin rejection, role restrictions, persisted sessions across app instances, and logout.
- `node scripts/smoke.js`: browser registration, session after reload, logout, and 390px viewport check passed; no JavaScript page errors.
- Reviewed the desktop login screenshot. All generated accounts are synthetic local test data.
