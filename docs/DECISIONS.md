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
