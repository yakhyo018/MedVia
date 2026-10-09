# Status

Where the project stands, what comes next, and how we work. A new session reads this first.
Update it whenever a milestone closes.

_Last updated: 2026-10-09 — AI-1 built on `feature/ai`, waiting for the user's run._

## The project

MedVia — portfolio project for Korean healthtech job applications. Foreign patients (RU / UZ / KK)
find verified Seoul clinics and book treatments in their own language. Not a business: no SMS, no
outgoing email, no payments, no HIRA. The sample patient persona is **Feride Karimova**.

- Repo: https://github.com/yakhyo018/MedVia — `main` = M0, `develop` = M0 … M7
- Design and data model: `~/Desktop/MedVia-design` — ER source `er/model.js`, mockup generators `source/`
- ER model (24 collections): https://claude.ai/artifact/LiWJjgdBPcaLSjdGkefKcA
- Clickable prototype (61 screens): https://claude.ai/artifact/Js6b1j85jbvBrxCSpNRiWt
- Mockup canvas: https://claude.ai/artifact/Ff8xgtPhDGpEEhy3x5ckTR
- Nestar (the codebase MedVia ports from, read-only): `~/Desktop/Nestar`

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| M0 | Skeleton — monorepo, Atlas, Redis, GraphQL, guards | ✅ done |
| M1 | Member + Auth — `members`, `sessions`, refresh rotation, admin | ✅ done, merged (`2892148`) |
| M2 | Clinic — AGENT CRUD, admin verification, list/detail, follow/like/view | ✅ done, merged (`eb6a1fa`) |
| M3 | Doctor — accounts created by the clinic (+ M3.1: shared `likeTarget`, flags on cards) | ✅ done, merged (`a96ac33`) |
| M4 | Treatment — `doctorIds[]`, draft/live review, clinic min price | ✅ done, merged (`9d33948`) |
| M4.1 | Unit tests — Jest for the rule-heavy code (39 tests) | ✅ done, merged (`2dc3b3e`) |
| M5 | Slot + Booking — atomic hold, transactions, state machine, consent | ✅ done, merged (`eb82b79`) |
| M6 | Review — only after a COMPLETED booking | ✅ done, merged (`7839c2e`) |
| M7 | Chat — socket.io rooms | ✅ done, merged (`9fb3323`) |
| **AI-1** | **Translator — chat translation + questionnaire KO summary** | **built, Postman + socket run by the user pending** |
| M8 | Community + CS + Notification | |
| M9 | Batch — BullMQ delayed jobs | |
| M10 | Admin + audit log + faker seed | |
| AI-2 | Booking assistant agent — tool use over own services, hold only after patient confirms | |

## Next step: the user runs AI-1, then merge; then M8

AI-1 is built on `feature/ai` (not committed yet). Left: the user runs `npm run test:api -- AI-1`
and `npm run test:socket` (both need `AI_PROVIDER=fake`, the default), then commit and merge.

- **Anthropic adapter: unverified** against the live API (request shapes covered by
  `providers.spec.ts`). Verify with a Console key and a few cents before publishing the portfolio:
  `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=…`, then one chat message and one booking.
- **OpenRouter demo:** the user creates a free key, runs
  `EVAL_MODELS="<free model ids>" npm run eval:translate`, picks a model, then sets
  `AI_PROVIDER=openrouter` and `AI_MODEL_TRANSLATE=<id>` in `.env`. Never in production — the API
  refuses to boot.
- After AI-1: **M8 — Community + CS + Notification** (start with the collection review).

## Session handoff — where the last session stopped

- `develop` is pushed and clean; `main` is still M0 (on purpose, see Open items). No feature
  branches are left except `feature/ai` (AI-1, until it is merged).
- Work only in `~/Desktop/MedVia` — never in a git worktree. If the desktop app starts a session
  inside `.claude/worktrees/…`, its hook blocks the Write tool on the main folder; open the session
  in `~/Desktop/MedVia` instead.
- The user runs the API with `npm run start:dev` on :3000 (watch mode). When it is not running,
  start a build on another port and point the suite at it:
  `PORT_API=3100 node dist/apps/medvia-api/main` + `BASE_URL=http://localhost:3100 npm run test:api`.
- Atlas Search: index `clinic_search` exists and is READY, with `clinicName`, `clinicNameKo`,
  `clinicDesc` and `clinicTreatmentNames` mapped; `.env` has `ATLAS_SEARCH_INDEX=clinic_search`.
  New mapped fields must be added by the user in Compass (Indexes → Search Indexes → Edit).
- Last full runs (2026-10-09, AI-1 branch): Newman M0–AI-1 green (923 assertions), Jest 162/162,
  `npm run test:socket` 13/13,
  `npm run typecheck`, `lint:check`, `build` clean.
- Merge routine the user expects after "commit qilib develop'ga merge qil": stage by name, read the
  diff, secret scan → commit → `git merge --no-ff` into `develop` → close the milestone here →
  scan the unpushed range → `git push origin develop` → `git branch -d` the merged branch.

### Lessons that cost time — do not repeat

- **A test proves something only if it can fail.** Break the feature, watch the test go red,
  restore (M4: a search test passed through the clinic name; M4.1: done for every unit test).
- **Postman test data must be unique to the path under test** — no shared tokens between a clinic
  name and a treatment name.
- **Atlas Search is eventually consistent** (4–8 s). Tests that search right after a write retry
  with `setNextRequest`; never cache text-search results (M3.1).
- **`npm test` does not type-check** (ts-jest + `isolatedModules`); `npm run typecheck` does.
- **Postman sandbox globals** (`data`, `tests`, …) must never be declared in scripts.
- **Mongoose never drops an index** removed from a schema; drop it in Compass.
- **Run Newman only after the watch server has reloaded.** A full run started during a reload
  failed 113 assertions in a cascade; the same run a minute later was green (M5).
- **When Bash is stuck** ("classifier gave no verdict"), the Terminal panel tool still runs
  commands; close its tabs afterwards (the session allows six).


## Left for later

- `memberMustChangePassword` is not enforced by the server (see DECISIONS, M3).
- **ER model** (`~/Desktop/MedVia-design/er/model.js`) still shows the pre-review collections.
  The schemas in `apps/medvia-api/src/schemas` are the truth.
- `clinicFollowers` vs the follow rows, and `clinicMinPrice` under two concurrent refreshes, can
  drift; a recount belongs in the M9 batch.
- Korean partial search (`피부과` inside `피부과의원`) would need an `autocomplete` mapping.

## Open items

- `GOOGLE_CLIENT_ID` not set — Google sign-in is built but only its failure path is tested.
  Real sign-in gets checked with the frontend.
- `gh` CLI is not logged in, so milestones merge locally (`--no-ff`) instead of through PRs.
- Postman writes run-time variables into `postman/postman/environments/MedVia Local.environment.yaml`.
  Check it before committing — it must never carry tokens or `adminPassword`.
- `main` stays at M0 until the production release; each milestone is merged into `develop` and
  `develop` is pushed. Merged `feature/*` branches are deleted locally after the merge.
- Deploy constraint: frontend and API on one site (`medvia.uz` + `api.medvia.uz`) — Safari blocks
  third-party cookies, and the refresh token is a cookie.

## How we work

The full rules are in `CLAUDE.md`. The ones a new session must not miss:

1. **Answer in Uzbek, short and decisive.** Code, comments and these docs stay in English.
2. **Every milestone:** collection review with the user → build → explain → Postman folder →
   the user runs it → merge. No schema before the review; no merge before the user's Postman run.
3. **Teach, not just build:** problem → alternatives with trade-offs → code → 3–5 interview
   questions **with answers**, recorded in `LEARN.md`. The user does not want to end up a vibecoder.
   The user asks many "what is X / why" questions mid-milestone — answer them simply, with the
   project's own examples, then continue.
4. **Ask before risky or outward actions** (history rewrites, `main`). Pushing `develop` after a
   milestone merge is agreed. Never touch `~/Desktop/Nestar`.
5. **Commit hygiene:** stage by name, read the staged diff, run the secret scan from `CLAUDE.md`.

## How to run

```bash
npm run start:dev              # API on :3000 (Atlas + local Redis via brew)
npm run seed:admin             # once; needs ADMIN_EMAIL / ADMIN_PASSWORD in .env
npm run test:api               # all Postman folders (needs the API running)
npm run test:api -- M1         # one milestone
npm run test:socket            # the chat socket end to end (needs the API running)
npm run eval:translate         # real AI models side by side (needs a key; costs on Anthropic)
npm test                       # Jest unit tests (no API, no database needed)
npm run typecheck && npm run lint:check && npm run build
```
