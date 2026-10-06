# LEARN

What each piece of MedVia does, why it exists, what was rejected, and the questions an
interviewer would ask about it. One section per milestone.

---

## M0 — Skeleton

### 1. Why a monorepo instead of two repositories

**Problem.** The API and the batch worker read the same Mongoose schemas, the same enums and the
same `Messages`. In two repositories they would diverge within a week: a new `BookingStatus` value
added in the API, the batch job still comparing against the old one, and no compiler to catch it.

**Options.**

| Approach | Shared types | Deploy separately | Cost |
| --- | --- | --- | --- |
| Two repositories | Copy-paste or a published npm package | yes | a release cycle for every shared change |
| One repository, one process | import directly | **no** | a long cron job blocks HTTP requests |
| **Nest monorepo, two apps** | import directly | yes | one `nest-cli.json` to maintain |

**Chosen:** the Nest monorepo. `nest build` emits `dist/apps/medvia-api` and
`dist/apps/medvia-batch` — two independent processes that share one `node_modules` and one
TypeScript project, so a schema change breaks the build on both sides at once.

Why they must stay separate processes: the batch app will hold slots open, release them and send
reminders. If a 40-second job ran inside the API process, Node's single thread would stall every
GraphQL request for those 40 seconds.

### 2. What the DI container actually does

`@Injectable()` does not create anything. It records metadata. At boot, Nest reads each
constructor's parameter types (from `emitDecoratorMetadata` in `tsconfig.json`), builds a graph, and
instantiates each provider exactly once — a singleton per module scope.

So `constructor(private readonly redisService: RedisService)` is not "import a Redis service". It is
"when you build me, hand me the one RedisService instance you already made". The practical
consequence is that in a test the container can hand over a fake instead, without the class under
test knowing.

`@Global()` on `RedisModule` means its exports are visible everywhere without importing it. Used
sparingly — here, because cache and Redis are cross-cutting and would otherwise appear in the
`imports` of nearly every module.

### 3. `forRoot` vs `forFeature`

| | `forRoot()` | `forFeature()` |
| --- | --- | --- |
| Called | once, in the app module | in every module that needs it |
| Creates | the connection / the global config | model tokens bound to that connection |
| Example | `MongooseModule.forRoot({ uri })` | `MongooseModule.forFeature([{ name: 'Clinic', schema }])` |

One `forRoot` opens the single Mongo connection pool. Each `forFeature` registers models against
that pool. Calling `forRoot` twice would open two pools — a real bug, not a style issue.

### 4. GraphQL code-first

`autoSchemaFile: true` means the SDL is generated from the TypeScript classes at boot, not
hand-written. `@ObjectType()` + `@Field(() => String)` on the `Health` class produces:

```graphql
type Health {
  status: String!
  mongo: String!
  redis: String!
  time: DateTime!
}
```

Why `@Field(() => String)` repeats a type TypeScript already knows: TypeScript types are erased at
compile time. `emitDecoratorMetadata` can recover `String`, `Number` and `Boolean`, but not
`string[]` or a union, so the explicit thunk is required everywhere for consistency. The thunk (an
arrow function instead of the bare type) also defers evaluation, which is what lets two types
reference each other without a circular-import crash.

Schema-first (writing `.graphql` files by hand) was rejected: it needs codegen to stay in sync with
the resolvers, and that is a second source of truth for the same contract.

### 5. The request chain

```
HTTP request
  → Guard          (AuthGuard / RolesGuard / WithoutGuard)   can this request continue?
  → Interceptor    (LoggingInterceptor, before)              start the timer, log the request
  → Pipe           (ValidationPipe)                          is the input shaped correctly?
  → Resolver → Service → Mongo / Redis
  → Interceptor    (LoggingInterceptor, after)               log the response and the duration
  → response
```

The order matters and is a common interview question. Guards run **before** pipes, so an
unauthenticated request is rejected before its input is ever validated — you cannot leak "that email
is already taken" to someone who is not logged in. Interceptors wrap both sides of the handler,
which is how one class measures the duration.

Three guards, three intentions:

| Guard | Used on | No token |
| --- | --- | --- |
| `AuthGuard` | my bookings, my profile | 400 |
| `RolesGuard` | create a clinic (AGENT), approve one (ADMIN) | 400, wrong role 403 |
| `WithoutGuard` | clinic list and detail | passes, `authMember = null` |

`WithoutGuard` is the interesting one. The clinic detail page is public, but a logged-in viewer also
needs to know whether they follow that clinic. Without it there would be two near-identical
resolvers; with it, one resolver branches on `authMember`.

### 6. Validating `.env` at boot

**Problem.** A missing `SECRET_TOKEN` does not fail at startup. It fails on the first login attempt,
in production, as a confusing JWT error.

`envValidationSchema` (joi) runs inside `ConfigModule.forRoot`. A malformed Mongo URI or a secret
under 16 characters stops the process immediately, with the variable named. Failing at boot is
always cheaper than failing on first use.

### 7. Redis from day one, as cache and queue only

Redis is in M0 rather than a later phase because retrofitting a cache changes call sites everywhere.
But its role is bounded, and the boundary is the point:

- **Cache** — `CacheService.wrap(key, ttl, loader)`. Every miss falls back to Mongo. Every Redis
  error is caught and degrades to a plain DB read, so Redis going down makes the site slow, not
  broken.
- **Queue** (M9) — BullMQ delayed jobs, so a slot hold expires at exactly 10 minutes instead of
  being noticed by a cron that polls every minute.
- **Blocklist** (M1) — a blocked member's JWT dies immediately instead of at expiry.

**Not** the slot lock. That stays in MongoDB as an atomic `findOneAndUpdate`, because the booking
and the slot must change together in one transaction. Holding the lock in Redis and the data in
Mongo means two systems that can disagree, and the failure mode is a double-booked patient.

### 8. The lint trap

Nestar's `package.json` has `"lint": "eslint ... --fix"`. Running it rewrites every file it touches,
so a one-module change produces a diff across the whole repository and the real change becomes
invisible in review.

MedVia has no `lint` script. `lint:check` never writes; `lint:fix` writes and is run on purpose.
A `.prettierrc` matching the existing tab style was added so the formatter and the committed code
agree from the first commit — Nestar has none, which is why its baseline carries 68 lint errors.

### Interview questions

1. Guards run before pipes. Name a concrete bug that the reverse order would cause.
2. `MongooseModule.forRoot` is called once and `forFeature` many times. What breaks if you call
   `forRoot` in each module instead?
3. Why does `@Field(() => String)` need the arrow function rather than `@Field(String)`?
4. Redis is in the stack from M0 but the slot lock stays in MongoDB. Defend that split.
5. `WithoutGuard` lets unauthenticated requests through. How is that different from no guard at all?
6. The health query reports `degraded` instead of throwing when Redis is down. Why is that the right
   behaviour for a cache and the wrong behaviour for a database?

---

## M0.1 — Redis and DI from first principles

### 1. Why a cache exists at all

The clinic list page runs an aggregation: `$match` on status, `$lookup` into members, `$sort`,
`$facet` for the page and the total. Every visitor triggers it again, although the result changes
only when a clinic edits its profile — a few times a day.

The cost is not "the disk is slow". MongoDB keeps hot data in RAM too (the WiredTiger cache). The
cost is **recomputing the same answer**: parse the pipeline, walk the index, join, sort, serialise —
on every request. A cache stores the *finished answer* and hands it back.

Rough orders of magnitude (the ratios matter, not the exact numbers):

| Operation | Time |
| --- | --- |
| Read from RAM | ~100 ns |
| Round trip to a server in the same data centre | ~0.5 ms |
| A small Mongo aggregation with one `$lookup` | ~5–50 ms |
| Redis `GET` of a ready answer | ~0.5 ms, almost all of it network |

### 2. What Redis is

A separate server process that keeps data in RAM as key → value, reached over TCP with a tiny text
protocol (RESP). `SET clinic:detail:42 "{...}" EX 300` is literally the bytes sent on the wire.

### 3. Why it is fast — and the price of that speed

1. **RAM.** No disk on the read path.
2. **One thread executes every command.** No locks, no context switches between commands. Each
   command is atomic by construction: nothing can run halfway through `INCR`.
3. **An event loop** (epoll on Linux, kqueue on macOS) serves thousands of sockets from that one
   thread — the same model as Node.js.

The price is point 2 turned around: **one slow command stops everyone.** `KEYS clinic:*` is O(N)
over the whole keyspace. With a million keys it runs for hundreds of milliseconds, and every
other client — the cache reads of every visitor — waits. That is why `invalidate()` now uses `SCAN`:
the cursor returns ~100 keys per call, and other commands run between calls. It also uses `UNLINK`
instead of `DEL`: `DEL` frees memory on the main thread, `UNLINK` hands it to a background thread.

### 4. Data structures, and where MedVia uses each

| Type | Shape | MedVia |
| --- | --- | --- |
| String | one value | cached JSON (`clinic:detail:<id>`), the JWT blocklist (M1) |
| Hash | small object of fields | not used yet |
| List | ordered, push/pop at ends | used internally by BullMQ |
| Set | unique members | not used yet |
| Sorted set | members ordered by a score | BullMQ delayed jobs (score = run-at time), rankings |
| Stream | append-only log | BullMQ events |

A sorted set is how a "release this slot hold in exactly 10 minutes" job works: the job sits with
score = now + 600 000 ms, and the worker pulls everything whose score is ≤ now.

### 5. RAM is volatile — so what is safe to put there

If Redis restarts, RAM is gone. Redis can persist (RDB snapshots, or an AOF append-only log — the
`--appendonly yes` in `docker-compose.yml`), but the safe design assumes loss anyway:

- **Cache:** lost → the next request rebuilds it from Mongo. Harmless.
- **Queue:** lost → BullMQ jobs vanish. Acceptable because each M9 job also has a cron sweep that
  finds anything missed.
- **The slot lock:** lost → two patients in one slot. **Not acceptable**, so it lives in Mongo.

There is a second reason the lock is not in Redis even though `SET key value NX` is atomic: the
slot and the booking must change **together**. Mongo can wrap both in one transaction. Redis and
Mongo cannot share a transaction, so a crash between the two writes leaves them disagreeing.

### 6. TTL and memory

RAM is finite. Every key gets a TTL so stale entries die on their own even if an invalidation is
missed. When memory still fills up, `maxmemory-policy allkeys-lru` evicts the least recently used
keys — correct for a pure cache.

### 7. Two cache failure modes to know by name

- **Stampede.** A hot key expires; 500 requests arrive in the same second; all miss; all run the
  aggregation. Fixes: a short lock so one request rebuilds while the others wait, or refresh the key
  shortly before it expires.
- **Penetration.** Requests for an id that does not exist always miss, because `wrap()` treats a
  `null` result as "not cached". Fix: cache the miss too, with a short TTL.

Neither is handled yet. Both become relevant in M2 when the clinic list is cached.

---

### 8. Dependency injection — the problem it solves

Without it, a class builds what it needs:

```ts
class BookingService {
	private redis = new Redis('redis://localhost:6379');
	private slots = new SlotService(new SlotRepository(mongoose.connection));
}
```

Four problems, all from that `new`:

1. **Every service opens its own Redis connection.** Ten services, ten sockets.
2. **The address is hard-coded.** Production needs a different one.
3. **It cannot be tested** without a real Redis and a real Mongo running.
4. **Change `SlotService`'s constructor and every class that builds one breaks.**

### 9. The idea: invert who creates what

The class only *declares* what it needs; someone else creates and hands it over:

```ts
class BookingService {
	constructor(private readonly cache: CacheService, private readonly slots: SlotService) {}
}
```

This is **inversion of control**: the class no longer controls the creation of its dependencies.
DI is the technique of passing them in through the constructor.

Without a framework, someone still has to wire everything once, at the top:

```ts
const redis = new RedisService(new Redis(url));
const cache = new CacheService(redis);
const booking = new BookingService(cache, new SlotService(/* ... */));
```

With 50 classes, writing and ordering this by hand is the real burden. A DI container automates
exactly this wiring.

### 10. How Nest's container does it

1. **TypeScript erases types at compile time** — at runtime there is no "RedisService" type to
   read. `emitDecoratorMetadata` makes the compiler leave a note behind on every decorated class:
   `design:paramtypes = [RedisService]`. `reflect-metadata` lets Nest read that note.
2. **Tokens.** For a class, the class itself is the token. When there is no class to point to — a
   third-party instance built by a factory, an interface (erased at runtime), a config value — a
   string token is used with `@Inject(TOKEN)`. That is why `REDIS_CLIENT` exists.
3. **Modules are visibility boundaries.** A provider is private to its module unless `exports`
   lists it, and only modules that `import` that module see it. `@Global()` removes the need to
   import — used only for `RedisModule`.
4. **Resolution.** Nest builds the graph and creates providers in dependency order — the
   `RedisClient` before `RedisService` before `CacheService` — **once each** (singleton scope by
   default).
5. **Cycles fail at boot** with "Nest can't resolve dependencies". `forwardRef()` works around it,
   but a cycle usually means two services should be split differently.

Scopes, for completeness: `DEFAULT` (singleton — almost always), `REQUEST` (a new instance per
request; it propagates up to everything that injects it and costs performance), `TRANSIENT` (a new
instance per injection).

A trap that breaks DI silently: `import type { RedisService } from './redis.service'`. A type-only
import is erased, so the metadata note records `Object` instead of `RedisService`, and boot fails
with an unresolved dependency. Injected classes must be imported as values.

### 11. What it buys in a test

```ts
const moduleRef = await Test.createTestingModule({
	providers: [
		CacheService,
		{ provide: RedisService, useValue: { redis: fakeRedis, ping: async () => 'PONG' } },
	],
}).compile();
```

`CacheService` receives the fake through the same constructor and never knows. That is the whole
payoff of point 3 in section 8.

### 12. The two fixes in this step

- `invalidate()` moved from `KEYS` + `DEL` to a `SCAN` cursor loop + `UNLINK` (sections 3 above).
- `app.enableShutdownHooks()` in both `main.ts` files. Nest calls `onModuleDestroy` on `app.close()`,
  but it only listens for SIGTERM / SIGINT when this is enabled. Without it, `RedisService.quit()`
  never ran on Ctrl+C or a container stop — the connection was cut, not closed.

### Interview questions

1. Redis runs commands on one thread, yet handles thousands of clients. How?
2. Why is `KEYS` dangerous in production while `SCAN` is fine, when both visit every key eventually?
3. `SET slot:42 held NX EX 600` is atomic. Why is the slot lock still in MongoDB?
4. What does `emitDecoratorMetadata` emit, and why can Nest not inject by interface?
5. A hot cache key expires and the database spikes. Name the problem and two fixes.
6. What breaks if `RedisService` is imported with `import type`?

---

## M1 — Member + Auth

### 1. Account vs profile

`members` holds one row per login for all four roles and is referenced from 28 places. It answers
one question — who is signed in, in which role — so it stays small: no counters, no bio, no nick.
A clinic's or doctor's public page lives in `clinics` / `doctors`, linked 1:1 by `memberId`.

A counter is a cache of a count. It pays off only where it is read constantly — a list of cards.
Otherwise it is a write on every like or follow plus a number that silently drifts when one `$inc`
is forgotten. A patient's "My Followings (12)" is read on one page, and its tabs need a split by
type that a single number cannot give anyway — one `$group` on `follows` does both.

### 2. Two tokens, two jobs

| | Access token | Refresh token |
| --- | --- | --- |
| Sent | with every request | only to `refreshToken` |
| Lifetime | 15 min | 30 days, sliding |
| Checked by | signature (+ a Redis lookup) | the `sessions` collection |
| Stored by the browser | in memory | httpOnly cookie |

The access token is a JWT: base64-encoded and signed, **not encrypted**. Paste one into a decoder
and everything inside is readable. So it carries only `sub`, `memberType`, `iatMs`, `jti` — never
an email or phone. Nestar put the whole member document into a 30-day token.

### 3. Why the refresh token must live in an httpOnly cookie

If page JavaScript can read the refresh token, so can any injected script (XSS). A refresh token in
`localStorage` is a 30-day credential one XSS bug away from an attacker — strictly worse than a
single 7-day token. `httpOnly` makes the cookie invisible to JavaScript; the browser attaches it
by itself. `path=/graphql` keeps it off other requests. `SameSite=Lax` stops other sites from
making the browser send it with a POST.

That last point forced a fix copied from Nestar: `enableCors({ origin: true, credentials: true })`
reflects any origin, which with a cookie lets any website call the API as the user and read the
answer. CORS now allows `FRONTEND_URL` only.

Deploy consequence: frontend and API must share a site (`medvia.uz` + `api.medvia.uz`). Safari
blocks third-party cookies outright, so on two unrelated hosts iPhones would never refresh.

### 4. Rotation and reuse detection

Every refresh issues a new refresh token and retires the old one. The swap is a single
`findOneAndUpdate({ sessionTokenHash: old })` — the same atomic match-and-modify that will guard
slots in M5: two requests with the same token cannot both win.

The retired hash is kept as `sessionPrevHash`. If it shows up again, someone replayed a token that
was already used:

```
owner and thief both hold RT1
thief refreshes first  → gets RT2, RT1 retired
owner refreshes with RT1 → matches sessionPrevHash → theft → session deleted
                         → RT2 dies too, and so do the member's access tokens
```

Whoever comes second exposes the copy. A **10-second grace window** separates theft from two tabs
refreshing at once (a browser restoring twenty tabs does exactly this): inside it the replay is
refused but the session survives, and the losing tab simply retries with the new cookie.

Only the SHA-256 of a refresh token is stored. bcrypt is slow on purpose because passwords are
short and guessable; 32 random bytes are not, so a fast hash is enough and a leaked collection
yields nothing usable.

### 5. Killing access tokens early

A JWT is valid until it expires; the server keeps no list. Two Redis keys add revocation:

| Key | Set by | Meaning | Expires |
| --- | --- | --- | --- |
| `auth:jti:<id>` | logout | this one token is dead | when the token would |
| `auth:revoked:<memberId>` | block, password change, theft | every token issued before this moment is dead | after 15 min — older tokens have expired by then |

The second key is the interesting one: a blocked member may hold tokens on five devices whose ids
we never recorded. One timestamp per member covers all of them.

**A bug the Postman suite caught.** The cutoff first compared whole seconds (`iat`). Signup and
block ran in the same second, so `iat < cutoff` was false and the blocked member's token survived.
Switching to `<=` would kill the fresh token `changePassword` hands back in that same second. The
fix is precision: an `iatMs` claim and a cutoff in milliseconds.

If Redis is down the check **fails open** and logs it — consistent with the Redis rule (slower,
never broken), with the 15-minute lifetime as the backstop.

### 6. Login that leaks nothing

- **One message** for unknown email and wrong password: no list of registered emails.
- **Same time** for both: when the email is unknown, bcrypt still runs against a dummy hash.
  Skipping it would answer ~70 ms faster for unknown emails — measurable from outside.
- **Status after password**: a guesser never learns that an account is blocked.
- **Throttle** 5 attempts/min keyed by IP **+ email**: limits guessing one account without
  locking out an office behind one IP. In production `trust proxy` makes `req.ip` the client,
  not Nginx — otherwise every user shares one counter.

### 7. Passwords

bcrypt with 10 rounds, length 8–72. bcrypt reads only the first **72 bytes**; two passwords that
differ after byte 72 hash identically, so longer input is refused rather than silently truncated.

### 8. Google sign-in and account takeover

The ID token is verified against Google's keys **and our client id** (`audience`); without the
audience check a token issued to any other app would sign users in here.

If the Google email already belongs to an email/password account, linking **removes that
password and ends its sessions**. MedVia never verified the address; Google did. Without this, an
attacker who registered `victim@gmail.com` first would keep a working password after the real
owner arrives through Google — a known attack called pre-account-takeover.

Google refuses sign-in inside in-app browsers (Telegram, Instagram) with `disallowed_useragent`.
Our patients open links in Telegram, so the frontend must offer "Open in browser"; email login
works there.

### 9. Smaller things worth knowing

- **`sparse` unique index** on `memberGoogleId`: without it, the second account with no Google id
  collides on `null`.
- **`lowercase: true`** on `memberEmail`: otherwise `Feride@Gmail.com` and `feride@gmail.com` are
  two accounts the unique index cannot see as duplicates.
- **TTL index** on `sessions.sessionExpiresAt`: MongoDB deletes expired sessions by itself.
- **Dot-path updates** for `memberNotify`: `$set: { memberNotify: { chatMessages: false } }`
  replaces the subdocument and resets the other toggles; `memberNotify.chatMessages` changes one.
- **`escapeRegex`** before building the admin search `RegExp`: otherwise `.*` matches everyone and
  a crafted pattern can freeze the event loop (ReDoS).
- **Singletons hold no request state.** A first draft kept "the member whose token was reused" in a
  field of `SessionService`; with two concurrent requests one would read the other's value.
- **`import type` cuts both ways.** Interfaces (`T`, `AuthMember`) in decorated signatures *must*
  be `import type` — they do not exist at runtime. Injected classes must *never* be — the
  metadata would record `Object` and DI fails.
- **Postman's sandbox has a global named `data`.** `const data = ...` in a test script throws
  "Identifier has already been declared".

### Interview questions

1. A JWT is "signed". Why is it still wrong to put the user's email in it?
2. Why is a refresh token stored in `localStorage` worse than having no refresh token at all?
3. Walk through how rotation exposes a stolen refresh token. Why does whoever comes second lose?
4. Why does reuse detection need a grace window, and what does it cost?
5. Revoking every token of a blocked user: what do you store, and why does that key expire after
   15 minutes?
6. Your login answers 70 ms faster for unknown emails. What did you leak, and how do you fix it?
7. Why is a password longer than 72 bytes rejected instead of accepted?
8. A Google user's email matches an existing password account. What must happen to that password,
   and what attack does it prevent?
9. The throttle is keyed by IP + email. What goes wrong with IP alone behind Nginx, and with IP
   alone in an office?
10. The suite caught a same-second bug in revocation. Why was `<=` not the fix?

---

## M1.1 — Refactor: one door for authentication

### The problem

After M1, `member.service.ts` held 22 lines of token, session and cookie work. Three symptoms:

1. **Duplication.** "Sign this member out everywhere" — end refresh sessions, revoke access
   tokens — was written by hand in five places.
2. **Drift had already started.** One of the five copies ended the sessions but forgot the
   access tokens. Harmless today (a block revokes them earlier), but this is exactly how copied
   code rots: one copy out of five gets forgotten.
3. **Wrong knowledge in the wrong place.** The member module knew which cookie the browser gets.

### The shape now

```
member.resolver ──► member.service ──► auth.service   (the facade: the only door)
        │                                 ├── token.service     access JWT: create, verify, revoke
        └── refreshToken / logout ───────►├── session.service   refresh sessions in Mongo
                                          └── refresh-cookie    set / read / clear the cookie
guards ──► token.service
```

| File | Owns |
| --- | --- |
| `auth.service.ts` | passwords, and the life of a session: `startSession`, `refreshSession`, `endSession`, `endAllSessions`, `withAccessToken` |
| `token.service.ts` | the access token only |
| `session.service.ts` | refresh sessions only — **not exported** from `AuthModule` |
| `member.service.ts` | members only: credentials, create, update, password change |

Five copies became one `endAllSessions()`, and the forgotten half disappeared with them.

### Three ideas behind it

**Facade.** Other modules see a few verbs — start, refresh, end — not the machinery behind them.
When M3 lets a clinic create a doctor account, or a magic-link login is added later, each new path
is one call to `startSession()`.

**Encapsulation through `exports`.** `SessionService` is not exported, so no other module can
reach around the facade and delete sessions directly. Nest enforces this at boot: injecting a
provider that a module does not export fails with "Nest can't resolve dependencies".

**Dependencies point one way.** `member → auth`, never back. `AuthService` needs to re-read a
member's status on refresh, so `AuthModule` registers the Member **model** with `forFeature` — not
`MemberModule`, which would create a cycle. `SessionService` used to depend on `AuthService`; now
that `AuthService` depends on `SessionService`, that edge would close a loop, so it moved to
`TokenService`.

### Why it was safe

A refactor must not change behaviour, and "I read the diff carefully" is not proof. The 90-assertion
Postman suite is: it passed before the refactor and after it. DI mistakes appear only at boot, not
at compile time — so the check was a booted server, not just `tsc`.

### Interview questions

1. What is a facade, and what did it buy in this module?
2. `SessionService` is not exported. What stops another module from using it anyway?
3. `AuthService` needs member data but must not import `MemberModule`. How, and why not?
4. Five copies of two lines — why not leave them? What had already gone wrong?
5. Typecheck passed after the refactor. Why was that not enough to call it done?
