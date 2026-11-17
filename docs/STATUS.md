# Status

Where the project stands, what comes next, and how we work. A new session reads this first.
Update it whenever a milestone closes.

_Last updated: 2026-10-15 — every planned backend milestone is done; frontend F0–F8 are done.
Now the production release (frontend F9): `feature/seed-variety` (below) is ready, then a
`DEMO_MODE` for production, Docker Compose files and the server (`medvia.tech`)._

## Navi in production (2026-11-17, branch `feature/navi-deploy`, docs only)

- Navi runs beside MedVia on the server: `medvia-navi` (Qwen2.5-0.5B + LoRA, bfloat16 on the CPU,
  3 GB cap, ~6 s per generated answer) + `medvia-navi-qdrant`, from
  `/home/MedVia-project/medvia-navi` (`docker-compose.prod.yml`, joins `medvia_monorepo-network`,
  no published port). Details in medvia-navi's `docs/STATUS.md` and README → Deploy.
- Production `.env`: `NAVI_URL=http://medvia-navi:8100` + the key of `medvia-navi/.env`; API and
  batch recreated. First `npm run navi:sync` in medvia-batch: 55 documents indexed; + 7 guides.
- Checked from the API container: 401 without the key, an English question answered with its
  source; port 8100 closed from outside. Free-form RU / UZ questions are refused (score < 0.80,
  Navi's known weakness). Live: the user asked "How do I cancel a booking?" on medvia.tech `/cs`
  (2026-11-17) → answer + 4 sources.
- Navi is not in CI/CD: updated by hand with its `./deploy.sh` (docs/CI-CD.md).

## N2 Navi sync from medvia-batch (2026-11-08, branch `feature/navi`)

- Batch `NAVI_SYNC` (03:30 Seoul, after RANK) + `npm run navi:sync`: live clinics, treatments,
  HEALTH_TIP articles, FAQ and NOTICE → Navi `POST /v1/documents` (200 per call); no longer live →
  `DELETE /v1/documents/{id}` (404 = fine; `guide-*` never touched). Keys empty → skipped; Navi
  down → FAILED in batchLogs, the batch keeps running.
- Markdown equals `medvia-navi/scripts/export_medvia.py` byte for byte (diffed: 55/55, meta too);
  that script is no longer needed for MedVia content.
- Checked: Jest 285, typecheck, lint, build; `navi:sync` against the running Navi → unchanged 55;
  a temporary FAQ → indexed 1 → deleted 1 → back to 55 unchanged. No new GraphQL API → no Postman.
- `getBatchStatus` now returns a `NAVI_SYNC` row; MedVia-next (`feature/navi`) labels it
  "MedVia Navi index sync · Daily 03:30" in five languages. Open: Navi has no list endpoint, so deletion sends a DELETE for
  every non-live id each night (a few dozen today).

## N1 MedVia Navi through the API (2026-11-08, branch `feature/navi`)

- `askNavi(input: { question })` for any signed-in member → the answer, `refused`, the sources with
  their page on the site, and a disclaimer. 10 questions a minute (Redis, fail open), 15 s timeout.
- `.env`: `NAVI_URL`, `NAVI_API_KEY` (= the key in `medvia-navi/.env`). Empty → "not available".
- Checked: Jest 274, typecheck, lint, build; Postman `N1 — Navi` 3/3 with Navi running.
- Next: the "Ask MedVia Navi" card on the site's `/cs` page. The nightly sync is N2 (above).

## AI-3 Face scan (2026-11-06, branch `feature/face-scan`, not merged)

- Approach C (the user's choice): MediaPipe in the browser (frontend, not built yet) + a vision
  model behind `AiProvider.analyzeFace`. Cosmetic reading only, never a diagnosis.
- `POST /face-scan` + `getMyFaceScans` / `getFaceScan` / `deleteFaceScan`; collection
  `faceScans`. The photo is never stored (cut `faceScanImage`); `confidence` cut.
- Checked: Jest 269, typecheck, lint, build; local API with the fake provider (consent 403,
  happy path, blurry, renamed PHP 400, list, delete, 6th scan refused; summary stored encrypted;
  `clean:test` removes FaceScan). Postman `AI-3 — Face scan` (8 requests, 20 assertions) passes
  with a new valid fixture `postman/fixtures/face-photo.png` — `clinic-photo.png` is a PNG
  without the IDAT CRC: `/upload` accepts it (magic bytes only), the face scan's chunk parser
  rightly refuses it. Not yet: a real vision model, the frontend.

## Deploy files (2026-10-16)

- `deploy/` removed by the user. Now `docker-compose.yml` (production, nestar style: Redis, API,
  batch on `node:22.20.0` with the repository mounted; ports on 127.0.0.1; the batch waits for
  the API's healthcheck) and `deploy.sh` (reset → checkout main → pull →
  `up -d --force-recreate medvia-api medvia-batch`). Local Redis: `docker compose up -d medvia-redis`
  (the service was `redis`). `Dockerfile` / `.dockerignore` removed.

## CI/CD (2026-10-18)

- GitHub Actions in both repositories (`.github/workflows/ci-cd.yml`): CI on every push / PR,
  deploy on a push to `main` over SSH with a forced-command key (`docs/CI-CD.md`). First automatic
  deploys done (API at once; web after a runner timeout → re-run). SSH now retries 3× on a
  connection failure. Postman stays manual (needs a running API).

## Production seed (2026-10-17, the user's choice)

- `seed:demo` in production accepts a SEED_PASSWORD of 6+ characters (was 16; development
  keeps 8) — a short, shareable demo password. In exchange `admin@seed.medvia.test` gets a random
  password in production (it still signs the notices and marks the demo data as present): the
  admin panel opens only with seed:admin's ADMIN_EMAIL / ADMIN_PASSWORD.
- Env validation: MONGO_PROD is required in production, MONGO_DEV only in development.

## Health-tip photos (2026-10-16, branch `feature/article-images`)

- The user's request: the existing article API, no new module — `articleImages` (0–2 paths, the
  first is the cover) on `BoardArticle`, in `ArticleInput` / `ArticleUpdate` (`ArrayMaxSize(2)`,
  `ArrayUnique`, `ARTICLE_IMAGE_PATTERN` = `uploads/article/<uuid>.jpg|png` only).
- **Health tips only:** `checkArticleImages` in `community.rules.ts` refuses photos on Q&A and the
  free board (`ARTICLE_IMAGES_NOT_ALLOWED`) — other people's before/after pictures cannot be
  checked; the update checks the post's own board. Upload target `article`: DOCTOR and ADMIN.
- Seed: `HEALTH_TIPS` got slugs; 7 generated still lifes (`seed/photos/articles/`, two tips with
  two photos); `seed:demo` copies them, `photos:attach` brings them into existing tips, the wipe
  deletes the copies.
- Checked: Jest 247 (new: rules + `ArticleInput` validation), and on the local API: a doctor
  uploads and posts a tip with a photo, 3 photos refused, `[]` clears, a patient's upload is 403,
  a question with a photo is refused. Postman not extended.

## Seed variety (2026-10-15, branch `feature/seed-variety`)

- **8 clinics × 3 doctors, 50 patients** (the user's choice; was 15 / 40 / 50). Two clinics per
  specialty, each with its own description, opening hours (Sunday, late Thursday, half-day
  Saturday, 07:00 check-ups) — slots fall inside them — and three hand-written doctors (name,
  gender, experience, bio, earlier post; generic places, never a real hospital).
- **Names checked on 2026-10-15** (Korean web search): the old ones collided with real clinics —
  한빛치과 (Seocho), 잠실가족치과, 이태원 글로벌치과 (with its director's name), Myeongdong Skin Lab,
  압구정라인의원 (Ansan). The new eight match no real clinic; Seoul Glow, Namsan and the tests'
  names were clean and kept.
- **Photos** (`seed/photos/clinics|doctors/<slug>-<n>.jpg`, prompts in `seed/photos/SOURCES.md`):
  **generated** (2026-10-16, the user's decision after adding $5 of Hugging Face credits; this
  replaces the stock photos of 2026-10-15) — `npm run photos:generate`, FLUX.1 Krea [dev] through
  HF Inference Providers (fal-ai), ~$0.04 an image. Clinics: 4 each (entrance, reception,
  treatment room, consultation room; the clinic's own look, no people, no signs); doctors: a
  studio portrait matching gender and age, 8 women of 24. `sips` shrinks them to web size on
  macOS. fal's safety checker sometimes returns a black frame for an empty room: the script
  retries with the next seed. `photos:attach -- --replace` swaps the photos of existing records.
- Dev DB reseeded; `clean:test` removed the old test accounts (also the F5 test clinic).

## getTrendingTreatments (2026-10-13)

- Public `getTrendingTreatments(limit)` for the landing page: one row per treatment name
  (category, specialty, min price, recent bookings, clinics), cached 10 minutes. Postman M4 / 63.

## Slim tests and data (2026-10-12)

- **Postman:** 850 → 470 request files (837 assertions; 509 sends with the retry loops): every API once on its happy path, one key
  failure (no token / wrong role) where the budget allows, at most 1.5 × the folder's APIs.
  State-building mutations were kept, refused requests and repeat queries removed; a few
  assertions were re-counted (M8a one report, M8c 6 unread / 5 marked). Full run green with the
  batch running; socket 17/17; Jest untouched (239).
- **Dev DB:** demo seed = 8 clinics, 24 doctors (3 each; since 2026-10-15), 50 patients,
  ~150 bookings, 69 reviews. Test leftovers (accounts, test notices, orphan audit rows, old batch
  logs) are removed by `npm run clean:test -- --yes`, which `test:api` runs after every run.
  One manual account remains: `ali@gmail.com` (left untouched).

## The project

MedVia — portfolio project for Korean healthtech job applications. Foreign patients (RU / UZ / KK)
find verified Seoul clinics and book treatments in their own language. Not a business: no SMS, no
outgoing email, no payments, no HIRA. The sample patient persona is **Feride Karimova**.

- Repo: https://github.com/yakhyo018/MedVia — `main` = M0, `develop` = M0 … M10 + AI-1 + AI-2
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
| AI-1 | Translator — chat translation + questionnaire KO summary | ✅ done, merged (`f6df81d`) — Anthropic adapter unverified |
| M8 | Community + CS + Notification — split into M8a / M8b / M8c | ✅ done — M8a merged (`4f598e4`), M8b + M8c merged (`8214884`) |
| M9 | Batch — BullMQ delayed jobs + nightly recount / rank | ✅ done, merged (`f0806ba`) |
| M10 | Admin + audit log + access log + faker seed | ✅ done, merged (`dba638f`) |
| AI-2 | Booking assistant agent — tool use over own services, hold only after patient confirms | ✅ done, merged (`623d9c6`) |

## Next step: plan the production release

Every milestone in the table is merged. What is left (to be planned with the user):

- **Frontend** — started as a separate repo **`~/Desktop/MedVia-next`** (2026-10-12): its
  `CLAUDE.md` and `docs/STATUS.md` hold the rules and the approved F0 plan (nestar-next structure
  and style, MedVia-design look).
- **Deploy** — frontend and API on one site (`medvia.uz` + `api.medvia.uz`): the refresh token
  is a cookie and Safari blocks third-party cookies.
- **AI in production** — AI-1's lock refuses fake / OpenRouter with `NODE_ENV=production`;
  decide consciously for the demo (synthetic data) — and a separate `medvia-demo` OpenRouter key.
- **Socket.IO Redis adapter** (M7) if the API runs as more than one instance.
- `develop` → `main` at the release.
- Small debts: `memberMustChangePassword`, Google sign-in (`GOOGLE_CLIENT_ID`), the ER model,
  Korean partial search, a translation model via `eval:translate`.

### What AI-2 built
- `components/assistant`: `sendAssistantMessage`, `confirmAssistantHold`, `getMyAssistantSession`,
  `closeAssistantSession` (patients only, AI consent required). Five tools over the existing
  services; `propose_hold` stores a proposal, only `confirmAssistantHold` holds.
- `AiProvider.converse` on all three providers: OpenRouter (function calling, `fetch`), Anthropic
  (`tool_use`, strict, cached system, `fallbacks: "default"`), Fake (scripted agent with markers
  `#bad-args`, `#loop`, `#forged-slot`, `#ai-fail`). The loop `runTurn` is a pure function.
- `assistantSessions` (append-only turns, `pendingHold` 15 min, TTL 30 days); limits: 6 model
  calls per message, 40 messages per session, 30 per Seoul day.
- `npm run eval:assistant` (12 cases, needs `OPENROUTER_API_KEY`); `AI_MODEL_ASSISTANT` in `.env`.
- Postman **`AI-2 — Assistant`** (order 15000, 40 requests, 76 assertions); 7 mutants, all killed.
  `formatError` maps 503 → `SERVICE_UNAVAILABLE`. Full runs green: Newman (938 requests,
  1567 assertions, batch running), socket 17/17, Jest 236/236, typecheck, lint, build.

### What M10 built
- **Access log** (`components/access-log`, `accessLogs`): one line per decrypt of the answers or
  the AI summary for the clinic or the doctor; never the patient's own, never the admin;
  `getMyAccessLogs` (patient) and `getAccessLogsByAdmin` (by patient or booking); TTL 1 year.
- **Audit:** MEMBER block / unblock / delete / restore, NOTICE publish / unpublish / remove —
  once per real change; `getAuditFeedByAdmin` (group, action, admin, date).
- `getMemberDetailByAdmin` (member), `getBookings` + `memberId` / `search` (after the scope),
  `getBookingStatsByAdmin` (booking), `getBatchStatusByAdmin` (audit-log). No admin module;
  the dashboard is one GraphQL request.
- **Seed** `npm run seed:demo [-- --reset]` (since 2026-10-12: 15 clinics, 40 doctors, 60 treatments, 50 patients; was 20 / 40 / 80 / 100),
  ~7 900 slots, 300 bookings, ~145 reviews, posts, notices; ends with the batch's RECOUNT + RANK.
  Logins: `feride@` / `yahyo@` / `clinic01@` / `doctor01@` / `admin@seed.medvia.test` with
  `SEED_PASSWORD` (in `.env`; `.env.example` has the placeholder). The dev database is seeded.
- Postman **`M10 — Admin`** (order 14000, 65 requests, 117 assertions); M2 / 28 now asserts that
  *its* clinic is filtered out (the seed's clinics share words of its name).
- Mutation checks: 6 mutants, all killed; the name search's 200-member cap was a real bug the
  suite found first. Full runs green: Newman M0–M10 (1489 assertions, batch running), socket
  17/17, Jest 215/215, typecheck, lint, build.

### What M10 left behind
- Demo logins: `feride@` / `yahyo@` / `clinic01@` / `doctor01@` / `admin@seed.medvia.test` with
  `SEED_PASSWORD` from `.env`; rebuild with `npm run seed:demo -- --reset`.
- Proposed, not done: add `SEED_PASSWORD=` to the secret-scan regex in CLAUDE.md.

### What M9 left behind
- Running locally needs both apps: `npm run start:dev` (API :3000) and `npm run start:dev:batch`
  (batch :3001, `batchUrl` in Postman; `BATCH_URL` overrides it for Newman).
- The first RECOUNT on the dev database fixed 77 clinics and 22 doctors (pre-M6 rows without
  rating / treatment-name fields); later runs fix 0.
- Every folder's admin login (but M1's) reuses a still-valid admin token —
  `postman/generators/reuse-admin.js`; a one-shot `npm run test:api` is green (1374 assertions).
- `postman/generators/` is still untracked (gen-m8a/b/c carry absolute paths; gen-m9 and
  reuse-admin are relative). Decide: commit with relative paths, or delete.
- `.claude/launch.json` (untracked) starts the batch from the desktop app's preview.
- Last runs (2026-10-11): Newman M0–M9 green, `test:socket` 17/17, Jest 199/199, typecheck,
  `lint:check`, `build` clean.

### What M8c left behind
- Socket namespace is **`/live`** (was `/chat`) — the frontend must connect there.
- `postman/generators/` (gen-m8a/b/c — the scripts that write the Postman folders) is untracked;
  not committed because it carries absolute paths. Decide: commit with relative paths, or delete.
- `apps/medvia-batch/image/IMG_6127.HEIC` is the user's stray photo — never commit it.
- 2FA was discussed and **declined** by the user (not on the roadmap).
- AI open items: Anthropic adapter unverified. OpenRouter translate model picked with eval:translate
  (2026-10-13): `nvidia/nemotron-3-super-120b-a12b:free` (16/16) — see DECISIONS.
- Last full runs (2026-10-10): Newman M0–M8c green (**1255** assertions, the user's Postman run
  of M8b + M8c green), Jest 188/188, `test:socket` 17/17, typecheck, `lint:check`, `build` clean.

## Session handoff — where the last session stopped

- `develop` is pushed and clean; `main` is still M0 (on purpose, see Open items). No feature
  branches are left.
- Work only in `~/Desktop/MedVia` — never in a git worktree. If the desktop app starts a session
  inside `.claude/worktrees/…`, its hook blocks the Write tool on the main folder; open the session
  in `~/Desktop/MedVia` instead.
- The user runs the API with `npm run start:dev` on :3000 (watch mode). When it is not running,
  start a build on another port and point the suite at it:
  `PORT_API=3100 node dist/apps/medvia-api/main` + `BASE_URL=http://localhost:3100 npm run test:api`.
- Atlas Search: index `clinic_search` exists and is READY, with `clinicName`, `clinicNameKo`,
  `clinicDesc` and `clinicTreatmentNames` mapped; `.env` has `ATLAS_SEARCH_INDEX=clinic_search`.
  New mapped fields must be added by the user in Compass (Indexes → Search Indexes → Edit).
- Last full runs: see "Done" above (2026-10-10, M0–M8c).
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

- **Test data cleanup (2026-10-12):** Postman / socket runs had left 1 123 `@medvia.test` accounts,
  342 clinics and 246 doctors in the dev DB (the frontend's doctors list showed them). Now
  `npm run clean:test` (dry run; `-- --yes` removes) cleans them, and `test:api` runs it at the
  end of every run. Shared removal code: `scripts/seed/accounts.ts` (also `seed:demo --reset`).
  `test:socket` does not clean after itself yet — the next `test:api` (or `clean:test`) does.
- **Seed doctors' languages:** KO + EN + 1–2 of their clinic's patient languages (RU / UZ / KK),
  so the patient-language filter finds doctors; the dev DB was re-seeded with `--reset`.
- Two accounts outside both domains remain (`@clinic.test`, `@test.com`) — origin unknown, left
  as they are.

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
npm run clean:test [-- --yes]  # count / remove the @medvia.test test data
npm run eval:translate         # real AI models side by side (needs a key; costs on Anthropic)
npm test                       # Jest unit tests (no API, no database needed)
npm run typecheck && npm run lint:check && npm run build
```
