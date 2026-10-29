# Development plan

## Source priority and student decisions

The student's direct instructions take precedence. Assignment requirements and the agent development contract take precedence over the v5 specification. Use the contract's five phases. The app is called **Hosh Quiz**; the GitHub repository remains `hashimthespeed-tech/HashQuiz`.

The student authorized the agent to test, push, merge, verify the remote merge, and continue automatically. Local API checks and brief real-browser checks replace Replit QA for this work. The student will handle Replit. Production deployment is outside this implementation task.

The v5 specification supplies sports, business, sales, and networking themes but no actual question bank or five exact quiz titles. Initial content uses Basketball, Football (soccer), Business, Sales, and Networking, with ten questions and explanations each.

## Branches and acceptance gates

0. Bootstrap an otherwise empty `main` with documentation only.
1. `phase-1-foundation-auth`: Express/static SPA shell, PostgreSQL users and sessions, bcrypt authentication, player/admin authorization. Verify registration, duplicates, valid/invalid login, logout, password hashes, session persistence, and role restrictions.
2. `phase-2-quiz-engine`: five seeded quizzes, four choices with one correct answer, server scoring, completion/results and retry. Verify scores, percentages, invalid/incomplete submissions, hidden answer keys, and ownership. Explanation modals wait for phase 5.
3. `phase-3-attempts-history`: persist completed attempts only; private history and retry records. Verify isolation, persistence, and exactly-once completion.
4. `phase-4-leaderboards-admin`: overall and topic rankings, admin question editor and assignments, CSV preview/validation/import. Verify ranking/ties, authorization, invalid rows, and preservation of earlier behavior.
5. `phase-5-custom-release`: instant explanations and ungraded flashcards, responsive polish, integration/browser checks, and deployment documentation. Verify both custom features, desktop/mobile behavior, and the full app's regression checks.

Push each phase branch before merging. Keep phase branches on GitHub. Use pull requests if API access is available; otherwise use ordinary non-fast-forward Git merges. Never force-push or bypass repository rules. Verify the remote `main` commit after every merge and rerun relevant checks on merged main before starting the next phase.

## Technical requirements

- Node.js 24 LTS; Express 5; npm and committed package-lock.json.
- Single server serves static files and API; vanilla HTML/CSS/JS hash-router SPA.
- PostgreSQL via `pg` and parameterized SQL; separate local/test/production databases.
- bcrypt with 12 rounds; HttpOnly, SameSite=Lax session cookies; secure cookies in production.
- Five working quizzes with at least ten questions each; exactly four choices and one correct choice.
- Completed attempts record user, quiz, score, total questions, and timestamp. Retries count; unfinished attempts and flashcards do not.
- Leaderboards display usernames. Topic ranking uses each user's highest score and completed attempt count; overall ranking uses completion count.
- CSV columns: topic,question_text,choice_a,choice_b,choice_c,choice_d,correct_choice,explanation. Preview before explicit import; import valid rows and report rejected rows.
- Custom features: server-validated instant explanation modal; ungraded flashcard practice.
- Palette: charcoal #0D0D0D, cream #F2EFEA, teal #557373, olive #272401, ice blue #DFE5F3; serif headings and sans-serif body.
- Never commit credentials, environment files, private data, or database files.

## Specification clarifications

Use ten questions per official attempt, even when a topic has a larger bank. A published topic must retain at least ten valid questions. Scores therefore remain comparable on a 0–10 scale.

The v5 topic leaderboard SQL orders ties by the user's earliest completed attempt, despite naming that value earliest_high_score_time. Preserve its explicitly supplied SQL behavior and use user ID as a final deterministic tie-breaker. Overall ties use earliest last-completion time, then user ID.

Phase 2 needs transient server-side answer state for scoring; phase 3 adds durable completed-attempt records. Do not add the educational modal until phase 5. Production database migrations and deployment remain the student's responsibility.
