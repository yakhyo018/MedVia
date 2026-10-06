# Status

Where the project stands, what comes next, and how we work. A new session reads this first.
Update it whenever a milestone closes.

_Last updated: 2026-10-06, after M1 merged into `develop`._

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
| **M2** | **Clinic — AGENT CRUD, admin verification, list/detail, follow/like/view** | **next** |
| M3 | Doctor — accounts created by the clinic | |
| M4 | Treatment — `doctorIds[]` | |
| M5 | Slot + Booking — atomic hold, transactions, state machine, consent | |
| M6 | Review — only after a COMPLETED booking | |
| M7 | Chat — socket.io rooms | |
| M8 | Community + CS + Notification | |
| M9 | Batch — BullMQ delayed jobs | |
| M10 | Admin + audit log + faker seed | |

## Next step: M2 — start with the `clinics` collection review

Bring these into the review:

- **Follow target model.** The mockup lets patients follow community authors (USER), not only
  doctors and clinics (`PatientFollowing` tab "Community authors", Follow button on articles).
  The ER model allows only DOCTOR / AGENT. Decide before writing `follows`.
- **`follows` index** `{ followerId: 1, createdAt: -1 }`. Nestar has only
  `{ followingId, followerId }` unique, so its "my followings" query is a COLLSCAN (prefix rule).
  Show it with `explain()` before and after.
- **Cache the clinic list** — first real use of `CacheService`; handle stampede and penetration.
- **Atlas Search** for clinic / treatment search (decided over Elasticsearch).
- M3 note: add `doctorFollowers` to `doctors` (clinics have `clinicFollowers`).

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
