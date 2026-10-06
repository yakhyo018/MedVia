# MedVia

Medical-tourism platform: foreign patients (RU/UZ/KK) book verified Seoul clinics.
NestJS GraphQL monorepo — `medvia-api` (API + Socket.IO), `medvia-batch` (cron + BullMQ).
Portfolio project: no SMS, no outgoing email, no payments, no HIRA.

## Read first

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

## Workflow

1. Plan before editing. For anything non-trivial, show the plan and wait for a yes.
2. Explain what was built: problem → alternatives → code → 3-5 interview questions.
   Code alone is an incomplete answer.
3. No package is added without stating which problem it solves and why not the alternative.
4. Keep changes small and in the existing pattern. Never delete working logic without a replacement.
5. Update `LEARN.md` after each module.
6. Answer in Uzbek; code and comments in English.

## Validation

```bash
npx tsc -p apps/medvia-api/tsconfig.app.json --noEmit
npx tsc -p apps/medvia-batch/tsconfig.app.json --noEmit
npm run build
npm run lint:check
```

There is no `npm run lint` script on purpose. The Nestar version carried `--fix` and rewrote
unrelated files on every run. Here the two halves are explicit: `lint:check` never writes,
`lint:fix` does and is run deliberately.

## Git

`main` ← `develop` ← `feature/<module>`. Conventional commits (feat/fix/refactor/test/chore).
