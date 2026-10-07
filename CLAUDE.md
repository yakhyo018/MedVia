# MedVia

Medical-tourism platform: foreign patients (RU/UZ/KK) book verified Seoul clinics.
NestJS GraphQL monorepo — `medvia-api` (API + Socket.IO), `medvia-batch` (cron + BullMQ).
Portfolio project: no SMS, no outgoing email, no payments, no HIRA.

## Read first

- **`docs/STATUS.md` — at the start of every session.** Where the project stands, the next step,
  open items, how we work. Update it whenever a milestone closes.
- `LEARN.md` — why each mechanism exists, trade-offs, interview Q&A. Update after every module.
- `docs/DECISIONS.md` — Decision / Why / Risks / Alternatives.

## Origin

Built new, not renamed. Ported from `~/Desktop/Nestar`: auth guards + decorators, member,
like/view/follow, board-article, comment, `libs/config` helpers, `Logging.interceptor`, batch app.
Never ported: the `property` module, `ws` / `@nestjs/platform-ws`, `MemberAuthType` PHONE/TELEGRAM.
After porting any file: `rg -n "nestar|Nestar|property|Property" <file>` must return nothing.

## Project shape

- resolver / service / module per component (Nestar pattern, DI based).
- DTOs, enums, types, utils under `apps/medvia-api/src/libs`. Schemas under `src/schemas`.

## Domain rules

- `MemberType`: `USER` (patient) · `AGENT` (clinic) · `DOCTOR` · `ADMIN`. The clinic is the AGENT account.
- Treatments belong to a clinic and carry `doctorIds[]` (at least one).
- Bookings carry `slotIds[]`; a 60-min treatment holds 2 consecutive 30-min slots in one transaction.
- A review requires a COMPLETED booking.
- Prefixed fields: `clinicName`, `bookingStatus`, `treatmentPrice`.
- String enums + `registerEnumType`, value equals name.
- Never hard-delete: `status: DELETE` + `deletedAt`.
- Counters via `$inc` in `xStatsEditor`. Pagination via `$facet: { list, metaCounter }`.
- Dates stored UTC, displayed `Asia/Seoul`.
- The slot lock lives in MongoDB (atomic `findOneAndUpdate`).
  Redis is cache and queue only — never a second source of truth.

## Auth rules

- `components/auth`: `auth.service` is the only door other modules use (passwords + `startSession`,
  `refreshSession`, `endSession`, `endAllSessions`, `withAccessToken`). `token.service` = access JWT,
  `session.service` = refresh sessions (not exported), `refresh-cookie.ts` = the cookie. Guards use
  `token.service`. Never call session or cookie code from another module.
- Access token: 15 min, claims `{ sub, memberType, iatMs, jti }` only — no personal data in a JWT.
- Refresh token: 32 random bytes in an httpOnly `medvia_rt` cookie (path `/graphql`, SameSite Lax);
  only its SHA-256 is stored, in `sessions`. Rotated on every refresh; a replay after the
  10-second grace ends the session and every access token of the member.
- Revocation lives in Redis: `auth:jti:<id>` (logout) and `auth:revoked:<memberId>` (block,
  password change, theft) compared in milliseconds. Fails open when Redis is down.
- CORS allows only `FRONTEND_URL`. Never `origin: true` with credentials.
- Interfaces in decorated signatures (`@Context() ctx: T`, `@AuthMember() m: AuthMember`) need
  `import type`; injected classes must never be `import type` — the metadata would read `Object`.

## DTO rules

- Every `@InputType()` field needs at least one class-validator decorator — `@IsOptional()` at
  minimum. The global `ValidationPipe` runs with `whitelist: true`, which silently strips any
  field that carries only `@Field()`: no error, no warning, the value is simply gone.
- Nestar ran without `whitelist`, so every DTO ported from it must be checked field by field.
- Fields set by the server after validation (`memberId = authMember._id`) need no decorator —
  the pipe has already run when they are assigned.

## Redis rules

- Never `KEYS` — it blocks the single Redis thread for the whole keyspace. Use `SCAN` with a cursor.
- `UNLINK` over `DEL` for bulk removal; memory is freed on a background thread.
- Every cache key gets a TTL. Key format: `<entity>:<scope>:<id-or-hash>`, e.g. `clinic:detail:<id>`.

## Workflow

1. Plan before editing. For anything non-trivial, show the plan and wait for a yes.
2. Explain what was built: problem → alternatives → code → 3-5 interview questions.
   Code alone is an incomplete answer.
3. No package is added without stating which problem it solves and why not the alternative.
4. Keep changes small and in the existing pattern. Never delete working logic without a replacement.
5. Update `LEARN.md` after each module.
6. Answer in Uzbek; code and comments in English.

## Milestone gates

Every milestone (M1…M10) passes two gates set by the user:

1. **Collection review — before any schema is written.** Present each collection the milestone
   introduces: fields, enums, refs, indexes, and which fields look unnecessary for the portfolio
   scope. The user may cut fields or whole collections and will have questions. No schema, DTO or
   service code until the user says yes. The ER model (`MedVia-design/er/model.js`) is the starting
   point, not a contract.
2. **Postman check — before the milestone closes.** Add a folder `Mx — <Name>` for the milestone
   under `postman/postman/collections/MedVia API/`: every query and mutation, the happy path and
   the failure paths (no token, wrong role, invalid input), each with test scripts. The user runs
   it. Only after it passes does `feature/<module>` merge into `develop`.

Order inside a milestone: review → build → explain + LEARN.md → Postman folder → user runs it → merge.

## Postman

- Postman 12 runs in git-native mode: one `*.request.yaml` file per request, plus a
  `.resources/definition.yaml` per folder (holds `order` and `description`). Write requests in this
  format directly. Never hand the user a v2.1 JSON to import — the importer drops GraphQL queries.
- GraphQL body: `body: { type: graphql, content: { query: |- ... } }`.
- File upload (REST): `body: { type: formdata, content: [{ key: file, type: file, src: fixtures/<file> }] }`;
  `src` is relative to `postman/`, fixtures live in `postman/fixtures/`.
- Never declare `data`, `tests`, `environment`, `globals`, `request`, `iteration` or `responseBody`
  at the top of a script — they are legacy Postman sandbox globals and the script fails with
  "Identifier has already been declared". Use `gql` for `body.data`.
- Test scripts must never throw. Guard every read: `const h = (body.data && body.data.health) || {}`,
  so a broken response reports a failed test instead of a script error. Put the server's own error
  text in the assertion message: `pm.expect(body.errors, JSON.stringify(body.errors))`.
- `npm run test:api` runs every folder from the terminal through Newman; `npm run test:api -- M1`
  runs one milestone. It reads the same YAML files Postman edits — there is no second copy.

## Validation

```bash
npx tsc -p apps/medvia-api/tsconfig.json          # app + spec files (tsconfig.app.json is for the build)
npx tsc -p apps/medvia-batch/tsconfig.app.json --noEmit
npm run build
npm run lint:check
npm test                # Jest unit tests — no API or database needed
npm run test:api        # needs the API running: npm run start:dev
```

There is no `npm run lint` script on purpose. The Nestar version carried `--fix` and rewrote
unrelated files on every run. Here the two halves are explicit: `lint:check` never writes,
`lint:fix` does and is run deliberately.

## Git

`main` ← `develop` ← `feature/<module>`. Conventional commits (feat/fix/refactor/test/chore).
`feat` is for something a patient, clinic, doctor or admin can notice; developer tooling is `chore`.

### Before every commit

1. Stage files by name. Never a blind `git add -A` / `git add .`.
2. Read `git diff --cached` in full.
3. Scan what is staged for secrets — it must print nothing:
   ```bash
   git diff --cached | grep -nE "mongodb(\+srv)?://[^<]+:[^<@]+@|SECRET_TOKEN=[^ .{][^ ]{7,}|rediss?://[^ ]+:[^ ]+@|ADMIN_PASSWORD=[^ .{[]"
   ```

`.env.example` is the committed template and only ever holds placeholders (`<user>:<password>`).
Real values live in `.env`, which is git-ignored. On 2026-10-06 real Atlas credentials reached
`.env.example` through a blind `git add -A` and had to be scrubbed from history before the first push.
