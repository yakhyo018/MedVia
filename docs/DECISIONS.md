# Decisions

One row per decision that would otherwise be rediscovered later. Newest milestone last.

## M0 — Skeleton

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| Build MedVia as a new repository instead of renaming Nestar. | The domain changes, not the branding. Nestar stays intact as a reference and as a second portfolio project. | Shared fixes have to be applied twice. | Rename Nestar in place; copy the whole repo and delete what is unused. |
| Nest monorepo with `medvia-api` and `medvia-batch`. | Both read the same schemas and enums; one TypeScript project means a schema change breaks both builds at once. Separate processes keep long jobs off the API thread. | One `nest-cli.json` and one `node_modules` for both. | Two repositories with a shared npm package; one process running cron inside the API. |
| MongoDB Atlas rather than a local MongoDB. | Atlas gives a replica set on the free tier, and transactions require one. Multi-slot booking needs a transaction. | Local development depends on the network. | Local single-node replica set via Docker. |
| Redis from M0, not from a later phase. | Retrofitting a cache changes call sites across every service. | An extra service to run locally. | Add Redis after the MVP, as originally planned on 2026-09-15. |
| The slot lock stays in MongoDB, never in Redis. | The booking and the slot must change together in one transaction. Two systems holding the same truth can disagree, and the failure mode is a double-booked patient. | Slot contention hits the database rather than an in-memory store. | Redis `SETNX` lock; a distributed lock library. |
| Cache failures degrade to a database read instead of throwing. | Redis is an optimisation. If it is down the site should be slow, not broken. | A silent Redis outage shows up only as latency. | Fail the request; health-check gate before every cache call. |
| `.env` validated with joi at boot. | A missing `SECRET_TOKEN` otherwise surfaces as a confusing JWT error on the first login in production. | Boot fails on a typo in a variable not yet used. | Validate lazily where each variable is read. |
| No `npm run lint` script; `lint:check` and `lint:fix` instead. | Nestar's `lint` carries `--fix` and rewrites unrelated files, which buries the real change in review. The same trap cost a session in the Petoria migration. | Anyone used to `npm run lint` gets "script not found". | Keep `lint` and remember not to run it. |
| Added `.prettierrc` matching the existing tab style. | The formatter and the committed code agree from the first commit. Nestar has no config, which is why its baseline carries 68 lint errors. | Differs from prettier defaults, so an editor without the config reformats. | Adopt prettier defaults and reformat everything once. |
| `tseslint.configs.recommended`, not `recommendedTypeChecked`. | Type-aware linting needs a project service wired to every file and is slow; it can be switched on once the codebase is larger. | Some type-related smells go uncaught for now. | Enable type-checked rules immediately. |
| GraphQL code-first (`autoSchemaFile`). | The resolvers are the single source of truth for the contract; schema-first needs codegen to stay in sync. | The SDL only exists after a successful boot. | Schema-first `.graphql` files plus codegen. |
| `@Global()` on `RedisModule`. | Cache and Redis are cross-cutting and would otherwise appear in almost every module's imports. | Global modules hide dependencies; used only here. | Import `RedisModule` explicitly in each module that caches. |

## M0.1 — Redis and shutdown fixes

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| `invalidate()` uses a `SCAN` cursor loop, not `KEYS`. | Redis executes commands on one thread; `KEYS` walks the whole keyspace in one call and blocks every other client. | A pattern invalidation now takes several round trips. | Tag sets (track a key list per entity); key versioning (bump a prefix instead of deleting). |
| `UNLINK` instead of `DEL`. | Memory is reclaimed on a background thread, so a large delete does not stall the main thread. | None meaningful on Redis ≥ 4. | `DEL`. |
| `app.enableShutdownHooks()` in both apps. | Nest ignores SIGTERM / SIGINT unless enabled, so `onModuleDestroy` never ran and connections were cut instead of closed. | Slightly slower shutdown while hooks run. | Handle signals manually in `main.ts`. |
| Global `ValidationPipe` keeps `whitelist: true`; rule written into CLAUDE.md. | Unknown input fields are stripped, so a client cannot smuggle `memberType: ADMIN` into a profile update. | Any input field without a class-validator decorator disappears silently. | `forbidNonWhitelisted: true` (reject instead of strip); no whitelist, as in Nestar. |

## M1 — Member + Auth

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| `members` is an account, not a profile: 19 fields, no counters. | 28 references point at it; every guard reads it. Public stats are read on clinic/doctor cards, so they live in `clinics` / `doctors`. Patient stats are rare and computed on read. | Admin user stats need an aggregation (M10). | Keep Nestar's 10 counters on the member. |
| `memberNick` removed. | It was Nestar's login id; MedVia signs in by email and the signup form never asks for a nick. | Community shows "Feride K." — a real initial, not a pseudonym. | Optional pseudonym for medical posts. |
| Access token 15 min + rotating refresh token (user's choice over a 7-day token). | A stolen access token is useful for minutes. The long-lived credential is revocable and rotated. | Twice the auth code; the frontend must refresh silently on page load. | One 7-day JWT plus a Redis blocklist (option D). |
| Refresh token in an httpOnly cookie, never in the body. | A refresh token in localStorage is readable by any XSS bug and lives 30 days — worse than no refresh token at all. | Cookies only reach the API when frontend and API share a site (deploy constraint below). | localStorage; body + native secure storage (kept for a future native app). |
| CORS limited to `FRONTEND_URL`. | Nestar's `origin: true, credentials: true` reflects any origin; with a cookie that lets any site act as the user. | A new frontend origin must be added to `.env`. | Origin reflection plus CSRF tokens. |
| Deploy frontend and API on one site (`medvia.uz` + `api.medvia.uz`). | Safari blocks third-party cookies; on separate free hosts the refresh cookie is never sent on iPhones. | Rules out mixing unrelated free hosting domains. | `SameSite=None; Secure` (still blocked by Safari). |
| Sessions in a MongoDB `sessions` collection, not Redis. | "Is this session valid" is source-of-truth data; with Redis down nobody could log in. A TTL index removes expired rows without a cron. | One Mongo write per refresh (every 15 min per active user). | Redis keys with TTL. |
| Store SHA-256 of the refresh token, not the token. | A leaked collection must not hand out sessions. A 32-byte random value cannot be guessed, so a fast hash suffices. | None meaningful. | bcrypt (needlessly slow); plaintext. |
| Reuse detection with a 10-second grace window. | A replayed old token means theft — unless two tabs refreshed at the same moment (browser session restore). Inside the window: refuse but keep the session. | A thief who replays within 10 s of the owner is not detected that time. | Strict (Auth0's default; logs users out on tab races); a configurable leeway. |
| Revocation cutoff in milliseconds (`iatMs` claim). | Caught by the Postman suite: with whole-second `iat`, a token issued earlier in the same second as a block survived it. `<=` would kill the fresh token `changePassword` hands out. | One non-standard claim. | Fractional `iat` (allowed by RFC 7519, awkward in tests); per-member token generation counter. |
| Revocation fails open when Redis is down. | Matches the Redis rule: slower or weaker, never broken. The 15-minute token lifetime is the backstop. | During an outage a blocked member keeps access up to 15 min. | Fail closed (whole site unusable without Redis). |
| One answer for unknown email and wrong password, and the same bcrypt cost for both. | Neither the message nor the response time reveals which emails are registered. | Users who signed up with Google get "wrong email or password" when trying a password. | Distinct messages (Nestar did this). |
| Password length 8–72. | bcrypt reads only the first 72 bytes; longer passwords would silently collide. | Very long passphrases are refused instead of truncated. | Pre-hash with SHA-256 before bcrypt. |
| Linking Google to an existing email account removes its password and ends its sessions. | Our signup never verified the email; Google did. Otherwise an attacker who pre-registered the victim's address keeps a working password (pre-account-takeover). | The legitimate owner must set a new password once. | Refuse linking; require email verification at signup. |
| Throttle `login` 5/min and `signup`/`googleLogin` 10/min, keyed by IP + email. | Limits guessing one account without locking out a whole office or mobile carrier behind one IP. | In-memory counters: correct only for one API process. | IP only; Redis-backed storage (needed for several processes). |
| `trust proxy` in production. | Behind Nginx every request comes from 127.0.0.1; the throttle would count all users as one. | Must match the real proxy depth. | Read `X-Forwarded-For` by hand. |
| ADMIN only through `npm run seed:admin`. | Signup can never create an ADMIN; the only door needs shell access and the database credentials. | One more manual step on a fresh environment. | Promote via a database console. |

## M1.1 — Auth refactor

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| `AuthService` is a facade over `TokenService`, `SessionService` and the cookie; `member.service` calls only it. | "Sign out everywhere" was copied in five places and one copy had already lost half its logic. Member code knew about cookies. | One more file and one more layer than Nestar's single `auth.service`. | Keep the orchestration in `member.service`; an `auth.resolver` owning refresh/logout. |
| `SessionService` not exported from `AuthModule`. | Nobody can bypass the facade; Nest refuses the injection at boot. | — | Export everything (Nestar's habit). |
| `AuthModule` registers the Member model, not `MemberModule`. | Refresh must re-check status; importing `MemberModule` would create a module cycle. | Two modules register the same model name (harmless on one connection). | Pass a loader callback into `refreshSession`. |
| `refreshToken` / `logout` resolvers call `AuthService` directly. | A member-service method that only forwards the call adds a layer with no logic. | Resolver injects two services. | Pass-through methods in `member.service`. |

## M2 — Clinic

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| `clinics` keeps only counters it writes now (likes, followers, views); rating, min price and rank arrive with M4/M6/M9. `clinicDoctors`, `clinicTreatments`, `clinicBookings` dropped. | A field appears when something writes it. Doctor and treatment counts are the length of lists the page already loads; bookings are aggregated by the rank batch. | Clinic cards show no rating until M6. | All 13 ER counters from day one. |
| `ClinicStatus`: `HIDDEN` removed, `CHANGES_REQUESTED` added. | The admin page has a "request changes" button; nothing in the mockups hides a clinic by itself. | — | Reuse REJECTED with a resubmit flag. |
| Status transitions enforced in the update filter (`{ _id, clinicStatus: <expected> }`). | Atomic: two admins cannot both decide; an edit cannot land on a status it did not check. | One extra read to explain a refusal. | Read-check-write; optimistic version field. |
| `signupClinic` creates the AGENT account and the clinic in one transaction; generic `signup` accepts USER only. | No AGENT account can exist without a clinic. | Transaction overhead on a rare operation. | Two-step signup; cleanup job for orphans. |
| Name, Korean name, district, address and an existing pin are locked once ACTIVE. | They are what the admin verified; sending a live clinic back to review would hide it with bookings in flight. | Real renames need a CS inquiry (M8). | Back to PENDING on edit (mockup text); a pending-changes sub-document. |
| `auditLogs` introduced in M2 instead of M10. | Admin decisions start here; a past decision cannot be reconstructed later. | One more collection early. | Log to stdout; add in M10. |
| `follows` target any member (USER, DOCTOR, AGENT), with `followingType` copied on the row. | The mockup follows community authors; tabs and badges need the type without a `$lookup`. Member type never changes. | — | `$lookup` members on every list. |
| `follows` index `{ followerId: 1, createdAt: -1 }`. | Measured: 20 000 → 10 documents examined for My Followings. | One more index to maintain on each follow. | `{ followerId, followingType, createdAt }` (breaks ESR for the All tab). |
| Like toggle decided by `deleteOne` + insert with the unique index; view by one upsert. | Nestar's read-then-write double-counts under concurrent clicks. | — | A transaction per like. |
| Follow row and `clinicFollowers` `$inc` are not in a transaction. | A transaction per follow costs latency for a counter that can be recounted. | A crash between the two writes drifts the count by one. | Transaction; count on read. |
| `FollowService` updates `clinicFollowers` through the Clinic model. | `ClinicModule` imports `FollowModule` (for `meFollowed`); the reverse import would be a cycle. | Clinic counter logic in two services. | `forwardRef`; an event emitter. |
| Cache: detail and list 60 s; per-viewer fields never cached; detail dropped on like/follow, list on any profile or status change; views never invalidate. | Stale counts next to the user's own action look broken; stale view counts do not. | Lists show like counts up to 60 s old. | Longer TTL with event-driven invalidation everywhere. |
| `CacheService.wrap()`: single-flight lock (`SET NX PX 3000`) and a 30 s miss sentinel. | Stampede and penetration, both named in M0.1. Measured: 50 concurrent identical requests → 1 rebuild. | Waiters poll for up to 1 s before reading the DB themselves. | Probabilistic early refresh; no protection. |
| Image upload via REST + multer, not `graphql-upload`. | `graphql-upload@14` pulls `dicer` (GHSA-wm7h-9275-46v2, crash on one malformed request, parsed before auth); v18 is ESM-only. Multer ships with Nest and runs after the guard. No package added. | Two transports (GraphQL + one REST route); guards had to learn the HTTP context. | `graphql-upload@18` with ESM interop; presigned URLs to object storage (later, in production). |
| Upload target is a fixed map; type from magic bytes; server-generated name; DTOs accept only `uploads/<folder>/<uuid>.(jpg\|png)`. | Path traversal, spoofed types and outside URLs (tracking pixels, `javascript:`). | — | Trust the client's name and MIME (Nestar). |
| Atlas Search when `ATLAS_SEARCH_INDEX` is set, escaped regex otherwise. | Relevance, typos and Korean analysis without a second system; the fallback keeps local runs and the test suite independent of the index. | Search index lags writes by a moment. | Elasticsearch; regex only; `$text` index. |
| `formatError` maps 404 to `NOT_FOUND`. | `@nestjs/apollo` maps only 400/401/403/422; a missing clinic reported as a server error. | — | Throw BadRequest for missing data (Nestar). |

## M3 — Doctor

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| `doctors` adds `doctorFollowers` and `deletedAt` to the ER model; rating/reviews (M6), answers (M8), rank (M9) deferred; treatment count not stored. | The page shows followers; soft delete is a project rule; the rest arrives with what writes it. | — | All ER counters now. |
| Public visibility = doctor ACTIVE **and** clinic ACTIVE, the clinic half via a cached `$in` of active clinic ids. | One source of truth, index-backed paging. Measured: `$lookup` 1003 ms, flag 286 ms, `$in` 317 ms (20 000 doctors). | `$in` grows with the number of clinics; move to a flag at tens of thousands. | `$lookup` per query; `clinicActive` flag with fan-out. |
| `DoctorStatus`: `HIDDEN` (clinic) and `SUSPENDED` (admin) are separate states. | A clinic must not be able to undo an admin decision. | — | One HIDDEN for both. |
| `createDoctor`: DOCTOR account + doctor page in one transaction; allowed before the clinic is approved (not when REJECTED/DELETE). | No orphan account or page; the admin sees the doctors while reviewing. | Doctors of a pending clinic exist but are not public. | Only after approval. |
| `memberMustChangePassword` is a flag for the frontend, not enforced by the server. | The mockup: the account "works right away". | The clinic knows the password until the doctor changes it. | Block every request until the password is changed. |
| `resetDoctorPassword` by the clinic, ending all the doctor's sessions. | No email in the project; otherwise a forgotten password locks the doctor out for good. | The clinic again knows a temporary password. | Admin-only reset. |
| `removeDoctor`: doctor DELETE + account DELETE in one transaction, sign-out after commit; follows/likes/views kept. | Soft delete; lists already drop non-ACTIVE doctors. | Counters on the removed doctor stay as they were. | Hard delete with cleanup of activity rows. |
| Another clinic's doctor is answered with NOT_FOUND. | Does not confirm that the id exists. | Harder to debug for a confused client. | FORBIDDEN. |
| Clinic changes drop `clinic:active:ids`, `doctor:list:*`, `doctor:detail:*` by prefix. | Doctor pages must disappear with a suspended clinic, without ClinicModule importing DoctorModule (cycle). | Every clinic edit clears every doctor page cache. | Clinic-scoped doctor keys; an event bus. |
| `getVisitedClinics` replaced by `getRecentlyVisited` (mixed timeline) + `clearRecentlyVisited` (hide, not delete); views index `{ memberId, updatedAt: -1 }`. | The mockup is one timeline; deleting would recount views on the next visit. | The old index `{ memberId, viewGroup, updatedAt }` stays in Atlas until dropped (Mongoose never drops indexes). | Per-group tabs; delete rows. |
| Doctor name search: escaped regex, no Atlas Search index. | Doctors are few; a second search index is not needed yet. | No fuzzy/Korean analysis for doctor names. | `doctor_search` index. |
| M2 search test waits for the index (replaced by a retry loop in M3.1). | Atlas Search is eventually consistent; the clinic approved a second earlier is not indexed yet. | Slower suite. | Retry loop in the test. |

## M3.1 — Shared like and viewer flags

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| One `likeTarget(likeGroup, likeRefId)` replaces `likeTargetClinic` / `likeTargetDoctor`; modules register a `LikeTargetHandler` on boot. | Two copies already, four in M8. New likeable types register a handler; `likeTarget` stays closed. Like module never imports its targets. | An unregistered group fails at request time, not at compile time. | One mutation per type (Nestar); a switch on likeGroup inside LikeService (imports every module). |
| `meLiked` / `meFollowed` on list cards (`getClinics`, `getNearbyClinics`, `getDoctors`), applied after the cache with one `$in` query per page. | Cards need the heart; the cached page is shared by everyone. | One or two extra queries per list request for signed-in viewers. | Nestar's per-card `$lookup` inside the pipeline (leaks through the cache); per-viewer cache keys (cache hit rate collapses). |
| Flags are booleans, not Nestar's `[{ memberId, likeRefId, myFavorite }]`. | The client reads one field. | — | Keep the array shape. |
| Text searches in `getClinics` are not cached; filter-only browsing is. | Low hit rate for free text, and caching a lagging index froze "not found" for the whole TTL after a clinic went live. | Every text search reaches Atlas. | Cache text searches with a short TTL; invalidate on index sync (no such signal). |
| M2 search test retries (`setNextRequest`, 15 × 2 s) instead of a fixed wait. | Index lag measured 4–8 s and varies. | A slow index makes the suite slower, not red. | Longer fixed wait; skip the test with Atlas Search on. |
| Role-specific list queries stay separate. | Mixing roles into one query mixes authorisation with filtering and needs the role in the cache key. | More resolvers. | One role-aware query. |

## M4 — Treatment

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| `treatmentBookings` deferred to M5 (monthly aggregation), `treatmentRank` dropped. | The mockup shows bookings per month; no screen sorts treatments by rank. | — | All-time counter now. |
| Edits of a live treatment: ad-relevant fields wait in `treatmentDraft`, operational fields apply at once. | Review without hiding the treatment and losing bookings. | Two versions to reason about. | Send the whole treatment back to PENDING on any edit. |
| A higher price applies at once, a lower one waits for review. | Only a lower "from" price can be bait; a booking stores its own price copy. | A clinic could raise a price without review. | Review every price change. |
| Review of an edit is version-checked (`draftSubmittedAt` in the filter). | The admin must not approve text the clinic changed after the admin read it. | The admin occasionally has to reload. | Lock the draft while an admin views it; no check. |
| `clinicMinPrice` and `clinicTreatmentNames` on clinics, recomputed from ACTIVE treatments after every change. | One clinic query for price range and treatment-name search; recomputation is idempotent and self-healing. | Two concurrent refreshes can leave a stale value until the next change (M9 batch rebuilds). | `$lookup` on every list; a second `treatment_search` index and a two-step query. |
| Treatment names searched through the existing `clinic_search` index (new mapped field). | One query, one index, relevance-ranked clinic results. | The Atlas mapping must be updated by hand. | A separate `treatment_search` index. |
| `removeDoctor` pulls the doctor from treatments in its transaction and hides treatments left without a doctor. | A treatment nobody performs cannot be booked. | — | Refuse to remove a doctor who still has treatments. |
| `getClinicTreatments` is not cached. | One indexed query per page; caching needs invalidation on treatment, doctor and clinic changes. | More reads under heavy traffic. | Cache per clinic and doctor filter. |
| `ClinicDecision` renamed `ReviewDecision` and shared by clinic and treatment review. | Same three admin buttons. | GraphQL enum name changed (no client depends on it yet). | A second identical enum. |
| No likes or views for treatments. | There is no treatment page in the mockups. | — | Register a TREATMENT like handler. |

## M4.1 — Unit tests

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| Use the Jest setup the Nest template already installed; no new package. | It was there since M0 with zero tests; `ts-jest` works with the project's `nodenext` config. | — | Vitest (would replace a working setup). |
| Unit-test the rule-heavy code: draft/price rules, opening hours, display names, the cache's single-flight and miss sentinel, the like toggle and handler registry. | These have many input combinations that Postman covers slowly or not at all. | Service code that only reads and writes stays covered by Postman alone. | Unit-test every service with mocked models. |
| Pure rules moved out of services (`treatment.rules.ts`, `clinic.rules.ts`), the clock passed in. | Test without a database or Nest; exact assertions. | Two places to look for treatment logic. | Test private methods through the service with mocks. |
| In-memory fakes (Redis, Mongoose model) through Nest DI, not a mocking library. | Shows the DI payoff; the fake also records commands for assertions. | Fakes can drift from the real API. | `ioredis-mock`, `mongodb-memory-server` (new packages). |
| Every new test checked against a deliberately broken feature before it was trusted. | M4 had a test that passed for the wrong reason. | Manual, not automated. | Stryker mutation testing. |
| `apps/medvia-api/tsconfig.json` (noEmit, `types: [node, jest]`, includes specs) used by the editor and `npm run typecheck`; the build keeps `tsconfig.app.json`. | ts-jest with `isolatedModules` never type-checks tests, and the build config excludes them — spec type errors went unnoticed and the editor did not know the jest globals. | Two tsconfigs to keep in line. | `isolatedModules: false` in ts-jest (slower runs); `@jest/globals` imports in every spec. |

## AI — scope (agreed before M5)

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| Two AI milestones: AI-1 Translator (with M7 chat), AI-2 Booking assistant agent (after M10). M5 is built without AI. | Language is the platform's core problem (RU/UZ/KK patients, KO clinics); the agent needs seeded data to be meaningful. Keeps M5 focused on the slot lock. | A third-party LLM in the stack: cost, latency, outages. | Build AI into M5; classic MT API only; admin ad-check or CS agent instead of the booking agent. |
| `components/ai` with `ai.service` as the only door; AI is never on the critical path. | Same pattern as `auth.service`; if the LLM fails the original text is shown and booking still works. | — | Call the SDK from each module. |
| Health data goes to the LLM only with the `AI_SUMMARY` consent, pseudonymised (no name, phone, email); output is labelled "not a diagnosis". | Questionnaire answers are sensitive data under PIPA. | Patients without consent get untranslated questionnaires. | Send everything; translate on the client. |
| The agent calls the existing services as tools; `holdSlots` only after the patient confirms. | The agent is just another client — the atomic hold and every booking rule still apply. | Prompt injection through clinic or review text. | Let the agent book directly. |

## M5 — Slot + Booking

| Decision | Why | Risks | Alternatives |
| --- | --- | --- | --- |
| Slots are documents the clinic creates ("Add slots"), bounded by `clinicHours`; created by upsert per start time. | The slot document is the lock; the unique `{doctorId, slotStart}` index makes creation idempotent and an upsert never touches a booked slot. | Many small documents (one per doctor per 30 min). | Virtual slots computed from hours, only taken ones stored; `insertMany` with ordered:false and duplicate errors. |
| Two-step booking: `holdSlots` (10 min) then `createBooking`. One live form hold per patient. | The mockup's timer; the hold is taken atomically before the questionnaire is filled. One hold per patient stops hoarding. | Two round trips. | Take the slots only on "Send request" (no timer). |
| Multi-slot hold: conditional `updateMany` + count check inside a transaction. | All n slots or none. | Transactions need a replica set (Atlas has one). | Per-slot `findOneAndUpdate` in a loop (same transaction, more round trips). |
| Lazy expiry: an expired hold counts as free in the write filter; PENDING past `respondDeadline` is read as EXPIRED and written on the next touch. | Correct without a background job until M9. | The database shows stale HELD / PENDING until something touches them. | A cron sweep now; a BullMQ delayed job now (M9 scope). |
| `holdExpiresAt` holds the form hold, then the clinic's deadline. | One field answers "when does this hold die". | One field, two phases. | Separate `respondDeadline` on the slot. |
| One `updateBookingStatus` for every role; transitions in a table in `booking.rules.ts`. | 3 mutations → 1; a rule is a table row; every combination unit-tested. | A bug in the shared path affects every role. | `confirmBooking`, `declineBooking`, `cancelMyBooking`, `cancelBookingByAdmin`. |
| One `getBookings` for every role; scope from the token, input filters only narrow. | 4 queries → 1; no IDOR by construction. | Same as above — covered by scope tests in Jest and Postman. | One query per role. |
| `cancelledBy` uses `BookingActor` (PATIENT/CLINIC/ADMIN); `SYSTEM` dropped. | Expiry is its own status, not a cancel. | — | Keep SYSTEM for expiry. |
| Questionnaire encrypted with AES-256-GCM in the API (`MEDICAL_ENC_KEY`, required at boot); decrypted only for the patient, clinic and doctor of the booking; never in lists or for the admin. | Health data is PIPA sensitive data; disk encryption does not stop a reader of the database. | Lost key = lost questionnaires; no search over answers. | Atlas encryption at rest only; MongoDB CSFLE / Queryable Encryption (needs `mongodb-client-encryption` and a KMS). |
| Consent snapshot per booking, version and time stamped by the server; `consents` collection cut. | Proof of the text agreed to; no account-level consent screen yet. | Withdrawal history needs the collection later. | `consents` history collection now. |
| Bookable only ≥ 3 h ahead; deadline = min(now + 24 h, visit − 1 h); max 3 PENDING per patient. | The clinic always has time to answer; no hoarding. | Last-minute bookings are impossible. | No lead time. |
| A patient cancels a confirmed visit until 24 h before; a request at any time before the visit. Decline and clinic/admin cancel need a reason. | Agreed in the review. | — | No limit. |
| `removeDoctor` refused while the doctor has a live request or a confirmed future visit. | Those patients would be left with a visit nobody performs. | The clinic must clear them first. | Cancel them automatically (SYSTEM). |
| `treatmentBookingsMonth` counted by `$lookup` on read (CONFIRMED/COMPLETED/NO_SHOW in this Seoul month); no counter field. | A counter would move on confirm and every later status change, and drift. | One lookup per clinic table load. | `$inc` counter on the treatment. |
| Seoul time by arithmetic (UTC+9), no timezone library. | Korea has no daylight saving time. | Wrong if ever reused for a zone with DST. | luxon / date-fns-tz. |
| Cut: `slotEnd`, `respondedAt`, `cancelledAt`, `bookingQueue`, reschedule, AI summary, questionnaire photos; `bookingReviewed` moves to M6. | Derivable, or out of the portfolio scope. | — | Keep the ER model's full shape. |
