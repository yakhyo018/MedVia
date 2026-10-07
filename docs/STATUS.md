# Status

Where the project stands, what comes next, and how we work. A new session reads this first.
Update it whenever a milestone closes.

_Last updated: 2026-10-07, after M4 merged into `develop`._

## The project

MedVia — portfolio project for Korean healthtech job applications. Foreign patients (RU / UZ / KK)
find verified Seoul clinics and book treatments in their own language. Not a business: no SMS, no
outgoing email, no payments, no HIRA. The sample patient persona is **Feride Karimova**.

- Repo: https://github.com/yakhyo018/MedVia — `main` = M0, `develop` = M0 … M4
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
| M4.1 | Unit tests — Jest for the rule-heavy code (39 tests) | built on `feature/unit-tests` |
| **M5** | **Slot + Booking — atomic hold, transactions, state machine, consent** | **next** |
| M6 | Review — only after a COMPLETED booking | |
| M7 | Chat — socket.io rooms | |
| M8 | Community + CS + Notification | |
| M9 | Batch — BullMQ delayed jobs | |
| M10 | Admin + audit log + faker seed | |

## Next step: M5 — start with the `slots` and `bookings` collection review

Bring these into the review:

- `bookingPrice` is a copy of `treatmentPrice` at booking time — M4's "a higher price applies at
  once" relies on it.
- A treatment of `treatmentDuration` holds `ceil(duration / 30)` consecutive slots of one doctor,
  in one transaction; the slot lock is an atomic `findOneAndUpdate` in MongoDB, never Redis.
- Only ACTIVE treatments of ACTIVE clinics, with an ACTIVE doctor from `doctorIds`, are bookable.
- `treatmentBookings` per month for the clinic's treatment table (deferred from M4).
- Clinic opening hours (`clinicHours`) bound the slots that can exist.
- The 10-minute hold and its release: a BullMQ delayed job comes in M9 — decide what M5 does
  without it (a lazy expiry check on read, or a sweep).

## What M3 left for later

- The obsolete `views` index `{ memberId, viewGroup, updatedAt }` is still in Atlas — Mongoose
  creates indexes but never drops them. Drop it once (Compass → views → Indexes).
- `memberMustChangePassword` is not enforced by the server (see DECISIONS).

## What M2 left for later

- **Atlas Search index** is not created yet. Create `clinic_search` in Atlas from
  `docs/atlas-search/clinics.json`, then set `ATLAS_SEARCH_INDEX=clinic_search` in `.env`.
  Until then the clinic text search is an escaped regex on the two names.
- **ER model** (`~/Desktop/MedVia-design/er/model.js`) still shows the pre-review `clinics` and
  `follows`. The schemas in `apps/medvia-api/src/schemas` are the truth.
- `clinicFollowers` and the follow row are two writes; a recount belongs in the M9 batch.

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
   questions, recorded in `LEARN.md`. The user does not want to end up a vibecoder.
4. **Ask before risky or outward actions** (push, history rewrites). Never touch `~/Desktop/Nestar`.
5. **Commit hygiene:** stage by name, read the staged diff, run the secret scan from `CLAUDE.md`.

## How to run

```bash
npm run start:dev              # API on :3000 (Atlas + local Redis via brew)
npm run seed:admin             # once; needs ADMIN_EMAIL / ADMIN_PASSWORD in .env
npm run test:api               # all Postman folders (needs the API running)
npm run test:api -- M1         # one milestone
npm test                       # Jest unit tests (no API, no database needed)
npm run typecheck && npm run lint:check && npm run build
```
