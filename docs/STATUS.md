# Status

Where the project stands, what comes next, and how we work. A new session reads this first.
Update it whenever a milestone closes.

_Last updated: 2026-10-06, M2 built on `feature/clinic`, waiting for the user's Postman run._

## The project

MedVia — portfolio project for Korean healthtech job applications. Foreign patients (RU / UZ / KK)
find verified Seoul clinics and book treatments in their own language. Not a business: no SMS, no
outgoing email, no payments, no HIRA. The sample patient persona is **Feride Karimova**.

- Repo: https://github.com/yakhyo018/MedVia — `main` = M0, `develop` = M0 + M1
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
| **M2** | **Clinic — AGENT CRUD, admin verification, list/detail, follow/like/view** | **built on `feature/clinic`; Newman 237/237 green; user's Postman run pending** |
| M3 | Doctor — accounts created by the clinic | |
| M4 | Treatment — `doctorIds[]` | |
| M5 | Slot + Booking — atomic hold, transactions, state machine, consent | |
| M6 | Review — only after a COMPLETED booking | |
| M7 | Chat — socket.io rooms | |
| M8 | Community + CS + Notification | |
| M9 | Batch — BullMQ delayed jobs | |
| M10 | Admin + audit log + faker seed | |

## Next step

1. **The user runs `M2 — Clinic` in Postman** (or `npm run test:api -- M2`). After it passes,
   `feature/clinic` merges into `develop` with `--no-ff`.
2. **M3 — Doctor**, starting with the `doctors` collection review. Bring in:
   - `doctorFollowers` on `doctors` — `FollowService` already accepts DOCTOR targets; it needs the
     `$inc`, like the AGENT branch.
   - `LikeGroup.DOCTOR` / `ViewGroup.DOCTOR` and the Doctors tabs of Favorites / Recently Visited.
   - Doctor accounts are created by the clinic: `MemberService.createEmailMember(…, session)` +
     the doctor row in one transaction, `memberMustChangePassword: true`.
   - `clinicDoctors` was dropped in M2 — the detail page counts the doctor list it loads.

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
- Local branch `feature/member` is fully merged and can be deleted.
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
npm run typecheck && npm run lint:check && npm run build
```
