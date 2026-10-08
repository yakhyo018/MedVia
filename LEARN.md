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

### Interview questions and answers

**1. Guards run before pipes. Name a concrete bug that the reverse order would cause.**

Guards first means an anonymous request is rejected before its input is touched. With pipes first, an unauthenticated caller could probe the input rules (which fields exist, which values are refused) and trigger any work a pipe does — transforming, parsing, or a pipe that loads data from the database — for free.

**2. `MongooseModule.forRoot` is called once and `forFeature` many times. What breaks if you call `forRoot` in each module instead?**

`forRoot` opens a connection pool. Calling it in every module opens one pool per module: many times the connections to Atlas (the free tier caps them), and models bound to different connections — a transaction session belongs to one connection, so writes across modules could no longer share a transaction.

**3. Why does `@Field(() => String)` need the arrow function rather than `@Field(String)`?**

Decorators run when the class is defined. The arrow function (a thunk) delays reading the type until the schema is built, so a type declared later in the file, or two types that reference each other (`Doctor` ↔ `Clinic`), still resolve. TypeScript also erases array and generic types at runtime, so `[String]` must be stated explicitly; using the thunk everywhere keeps it uniform.

**4. Redis is in the stack from M0 but the slot lock stays in MongoDB. Defend that split.**

Redis is a cache and a queue: if it loses data the site gets slower, not wrong. The slot hold must change together with the booking in one MongoDB transaction, which Redis cannot join — a crash between the two writes leaves them disagreeing. And Redis may evict or lose keys on restart; a lost lock is a double-booked patient.

**5. `WithoutGuard` lets unauthenticated requests through. How is that different from no guard at all?**

`WithoutGuard` still reads a token when one is sent, verifies it and attaches the member, so one resolver can serve guests and personalise for members (`meLiked`, recording a view). An invalid token is simply treated as a guest. With no guard at all, the resolver never knows who is asking.

**6. The health query reports `degraded` instead of throwing when Redis is down. Why is that the right behaviour for a cache and the wrong behaviour for a database?**

A cache is an optimisation: without Redis every answer is still correct, only slower, so the instance should keep serving and say `degraded`. The database is the source of truth: without it the instance cannot answer correctly, so its health check must fail and the load balancer must stop sending it traffic.

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

### Interview questions and answers

**1. Redis runs commands on one thread, yet handles thousands of clients. How?**

One thread runs commands, but it never waits: an event loop (epoll / kqueue) multiplexes thousands of non-blocking sockets, and each command is a tiny in-memory operation measured in microseconds. The thread is always doing useful work instead of waiting on I/O.

**2. Why is `KEYS` dangerous in production while `SCAN` is fine, when both visit every key eventually?**

`KEYS` is one command that walks the whole keyspace; on the single command thread every other client waits until it ends. `SCAN` does a small batch per call and returns a cursor, so other commands run in between. The total work is similar — the difference is one long stall versus many short slices. (`SCAN` may return a key twice; callers must tolerate that.)

**3. `SET slot:42 held NX EX 600` is atomic. Why is the slot lock still in MongoDB?**

The `SET NX` is atomic, but the hold must be written in the same transaction as the booking, and Redis cannot take part in a MongoDB transaction. A crash between the two writes, a restart, or LRU eviction of the key would leave a slot that looks free while a booking holds it — a double-booked patient.

**4. What does `emitDecoratorMetadata` emit, and why can Nest not inject by interface?**

It emits `design:paramtypes`: the runtime classes of each constructor parameter, which Nest reads to know what to inject. An interface is erased at compile time, so nothing exists at runtime to point to — the metadata says `Object`. Interfaces need a token (`@Inject('NAME')`) instead.

**5. A hot cache key expires and the database spikes. Name the problem and two fixes.**

A cache stampede (thundering herd): many requests miss at once and all rebuild. Fixes: a single-flight lock so one request rebuilds and the others wait (`SET NX PX`, used in MedVia), and refreshing the key before it expires (early or probabilistic refresh); adding TTL jitter keeps many keys from expiring together.

**6. What breaks if `RedisService` is imported with `import type`?**

`import type` is erased, so `design:paramtypes` records `Object` instead of `RedisService`. It compiles, and then fails at boot: "Nest can't resolve dependencies of CacheService (?)".

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

### Interview questions and answers

**1. A JWT is "signed". Why is it still wrong to put the user's email in it?**

Signed is not encrypted: the payload is base64 that anyone holding the token can read — and tokens end up in logs, proxies and browser storage. Personal data in it also cannot be corrected or revoked until the token expires. MedVia's token carries only ids, role and times.

**2. Why is a refresh token stored in `localStorage` worse than having no refresh token at all?**

A refresh token lives 30 days and mints new access tokens. In `localStorage` any injected script reads it, so one XSS bug hands an attacker a month-long credential — strictly worse than a short-lived access token alone. An httpOnly cookie is invisible to page JavaScript.

**3. Walk through how rotation exposes a stolen refresh token. Why does whoever comes second lose?**

Every refresh issues a new token and keeps the old hash as `sessionPrevHash`. If owner and thief both hold RT1, the first to refresh gets RT2; when the second shows RT1, it matches the previous hash — a replay — and the whole session plus every access token of the member is killed. Whoever comes second exposes the copy; if the thief was first, the owner's refresh ends the thief's session too.

**4. Why does reuse detection need a grace window, and what does it cost?**

Two tabs, or a browser restoring its session, refresh the same token at the same moment; the second would look like theft and log a real user out. Inside a 10-second window the replay is refused but the session survives. The cost: a thief who replays within 10 seconds of the owner is not caught that time.

**5. Revoking every token of a blocked user: what do you store, and why does that key expire after 15 minutes?**

A cutoff timestamp in Redis, `auth:revoked:<memberId>`, compared with the token's `iatMs`; the refresh sessions are deleted in MongoDB. The key needs to live only 15 minutes because access tokens expire after 15 minutes — after that every token issued before the cutoff is dead on its own.

**6. Your login answers 70 ms faster for unknown emails. What did you leak, and how do you fix it?**

Which emails are registered (user enumeration through timing). Run bcrypt on every attempt — against a dummy hash when the email is unknown — so both paths cost the same, and return the same message for both.

**7. Why is a password longer than 72 bytes rejected instead of accepted?**

bcrypt reads only the first 72 bytes. Two passwords that share those bytes would both work, and the user would believe the rest of their passphrase protects them. Refusing is honest; the alternative is pre-hashing (SHA-256 then bcrypt).

**8. A Google user's email matches an existing password account. What must happen to that password, and what attack does it prevent?**

The password must be removed and the account's sessions ended. MedVia never verified the email; Google did. Otherwise an attacker who registered the victim's email first keeps a working password after the real owner arrives through Google — pre-account takeover.

**9. The throttle is keyed by IP + email. What goes wrong with IP alone behind Nginx, and with IP alone in an office?**

Behind Nginx without `trust proxy`, every request comes from 127.0.0.1, so all users share one counter and everyone gets throttled together. In an office or behind a mobile carrier's NAT, many users share one IP, so one attacker guessing passwords locks out everybody there. IP + email limits guesses per account.

**10. The suite caught a same-second bug in revocation. Why was `<=` not the fix?**

`iat` is in whole seconds: signup and block in the same second gave `iat < cutoff` = false and the blocked token survived. `<=` would also kill the fresh token `changePassword` hands back in that same second, logging out the user who just changed the password. The fix was precision: an `iatMs` claim and a cutoff in milliseconds.

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

### Interview questions and answers

**1. What is a facade, and what did it buy in this module?**

One simple entry point in front of several classes. `AuthService` offers start / refresh / end / end-everywhere; callers never touch tokens, sessions or the cookie. It collapsed five copies of "sign out everywhere" into one method, and later login paths (doctor accounts in M3) reuse it.

**2. `SessionService` is not exported. What stops another module from using it anyway?**

Nest's module encapsulation: a provider is private to its module unless listed in `exports`. Injecting `SessionService` elsewhere fails at boot with "Nest can't resolve dependencies".

**3. `AuthService` needs member data but must not import `MemberModule`. How, and why not?**

`AuthModule` registers the Member **model** with `MongooseModule.forFeature`. Importing `MemberModule` would close a cycle, because `MemberModule` already imports `AuthModule`.

**4. Five copies of two lines — why not leave them? What had already gone wrong?**

Copies drift. One of the five had already ended the sessions but forgotten to revoke the access tokens; the next edit would have missed something else. One method means one place to fix and one place to test.

**5. Typecheck passed after the refactor. Why was that not enough to call it done?**

Dependency-injection mistakes — a missing provider, an unexported one, a cycle — only appear when the application boots. And a refactor must not change behaviour, which only running it proves: the 90-assertion Postman suite passed on a booted server before and after.

---

## M2 — Clinic

### 1. A status field is a state machine — enforce it in the write, not in an `if`

```
PENDING ──► ACTIVE | CHANGES_REQUESTED | REJECTED     (admin)
CHANGES_REQUESTED ──► PENDING                         (clinic resubmits)
ACTIVE ◄──► SUSPENDED                                 (admin)
```

The naive version reads, checks, writes:

```ts
const clinic = await this.clinicModel.findById(id);
if (clinic.clinicStatus !== 'PENDING') throw ...;   // two admins both pass this line
await this.clinicModel.updateOne({ _id: id }, { clinicStatus: 'ACTIVE' });
```

Two admins clicking at the same moment both read PENDING, both write, and the audit log gets
two decisions. The fix is to put the expected state **into the filter**:

```ts
findOneAndUpdate({ _id, clinicStatus: 'PENDING' }, { $set: { clinicStatus: 'ACTIVE' } })
```

MongoDB matches and modifies one document atomically, so only one request finds a PENDING row;
the other gets `null` and is told "not allowed in the current status". This is the same pattern as
the refresh-token rotation in M1 and the slot hold in M5.

The approval rule (at least one photo and one language) goes into the same filter —
`'clinicImages.0': { $exists: true }` — so the check and the write cannot drift apart either.
When the update matches nothing, one extra read explains why (missing / wrong status / incomplete).

The same idea protects the clinic's own edits: `updateMyClinic` reads the status, decides which
fields are locked, and writes with `{ _id, clinicStatus: <what it read> }`. If an admin approves
the clinic in between, the write matches nothing — otherwise a PENDING-time rename would land on a
just-verified clinic. The name for this bug class is **TOCTOU** (time of check to time of use).

### 2. The first transaction: account and clinic together

`signupClinic` creates a `members` row (AGENT) and a `clinics` row. Without a transaction, a crash
or a validation error between the two inserts leaves an AGENT account with no clinic: it can log
in, owns nothing, and its email can never register again. That is why the generic `signup` no
longer accepts AGENT at all.

```ts
const session = await this.connection.startSession();
await session.withTransaction(async () => {
	member = await this.memberService.createEmailMember({ ... }, session);
	await this.clinicModel.create([{ ...clinic, memberId: member._id }], { session });
});
```

- `create([...], { session })` — the array form is required to pass options.
- `withTransaction` **retries** the callback on transient errors (an election, a write conflict),
  so the callback must be safe to run twice. It only inserts; nothing outside the database
  happens inside it.
- The refresh cookie is set **after** the commit, never for an account that was rolled back.
- Transactions need a replica set. Atlas always is one — the reason Atlas was chosen in M0.

### 3. Caching the clinic pages

| Key | TTL | Dropped when |
| --- | --- | --- |
| `clinic:detail:<id>` | 60 s | the clinic edits its profile, any admin decision, a like, a follow |
| `clinic:list:<sha1(input)>` | 60 s | any clinic edit or admin decision (`SCAN clinic:list:*`) |

**What is never cached: `meLiked`, `meFollowed`.** They differ per viewer. Cached, the first
patient's red heart would be shown to everyone after them. They are added after the cache read.

**Views are not invalidated.** Every first visit bumps `clinicViews`; dropping the cache on each
would make the cache useless on exactly the popular pages. A view count 60 s behind is fine.

**Stampede — single-flight.** When a hot key expires, every request that arrives before the first
one finishes rebuilding sees an empty key and goes to MongoDB. `wrap()` now lets only one rebuild:

```
SET lock:clinic:list:<hash> 1 NX PX 3000
     NX = set only if the key does Not eXist   → exactly one request gets "OK"
     PX = expire after 3000 milliseconds       → a crashed holder blocks nobody for long
```

The winner loads and stores; the others poll the cache every 50 ms for up to 1 s, then fall back
to a direct read (slower, never broken). Measured with `redis-cli MONITOR` and 50 identical
requests at once: **50 lock attempts, 1 cache write** — MongoDB ran the aggregation once.

**Penetration.** A request for an id that does not exist always misses, because "not found" was
never stored. `wrap()` now stores a `__miss__` sentinel for 30 s. And an id that is not even a
valid ObjectId is answered before it reaches Redis or MongoDB.

### 4. Counters under concurrency

**Like.** Nestar read first, then inserted or deleted. Two clicks arriving together both read
"not liked", both insert, the counter goes up twice. Now the write decides:

```ts
const { deletedCount } = await likeModel.deleteOne({ memberId, likeRefId });
if (deletedCount) return -1;                     // it existed: unliked
try { await likeModel.create(...); return 1; }   // first insert wins
catch (e) { if (e.code === 11000) return 0; }    // the unique index refused the twin
```

**View.** One `updateOne(..., { upsert: true })`. `upsertedCount === 1` means a first visit
(counter +1); otherwise only `updatedAt` moves, which puts the clinic back on top of Recently
Visited. Two tabs opening at once cannot both be "first": the unique index refuses one.

**Counters move only through `$inc`.** `{ $inc: { clinicLikes: 1 } }` is applied inside the
document lock; reading the number, adding one in Node and writing it back loses updates.

What is still not atomic: the follow row and the `clinicFollowers` `$inc` are two writes. A crash
between them drifts the counter by one. A transaction would fix it at the cost of latency on
every follow; the M9 batch can recount instead. Accepted, written down.

### 5. The `follows` index, measured

"My Followings" asks: `find({ followerId }).sort({ createdAt: -1 })`. Nestar had only
`{ followingId: 1, followerId: 1 }`. An index is used from its **left prefix**: a query on
`followerId` alone cannot enter an index that starts with `followingId`.

`explain('executionStats')` on 20 000 follows, before and after adding `{ followerId: 1, createdAt: -1 }`:

| Index | Plan | Docs examined | Returned |
| --- | --- | --- | --- |
| Nestar `{ followingId, followerId }` | `COLLSCAN → SORT` (in memory) | 20 000 | 10 |
| + `{ followerId, createdAt: -1 }` | `IXSCAN → FETCH → LIMIT` | 10 | 10 |

The index order follows the **ESR rule**: **E**quality fields first, then **S**ort, then
**R**ange. `followerId` (equality) then `createdAt` (sort): the index hands rows over already
ordered, so there is no in-memory sort and `LIMIT 10` stops after 10 keys.

Two more details from the same query:

- **`$sort` before `$facet`.** A `$facet` sub-pipeline never uses an index. Sorting inside it would
  sort every follow of the member in memory; sorting before it lets the index do it.
- **`followingType` is copied onto the follow** (USER / DOCTOR / AGENT). Tabs and their badges
  ("Clinics (4) Doctors (6)") come from one `$group` without a `$lookup` into `members`.
  Denormalising is safe here because a member's type never changes — the copy cannot go stale.

### 6. Image upload, and three ways it goes wrong

Uploads moved from GraphQL to a REST endpoint, `POST /upload/image?target=clinic`:

1. **A vulnerable parser.** Nestar used `graphql-upload@13`. Its multipart parser `dicer` can be
   crashed by one malformed request (GHSA-wm7h-9275-46v2), and the middleware runs **before** any
   guard — anyone could take the API down. The fixed version is ESM-only. Multer already ships
   with `@nestjs/platform-express`, and an interceptor runs **after** the guard: an anonymous
   request never reaches the parser. No package was added.
2. **Path traversal.** Nestar wrote to `uploads/${target}` with `target` from the client;
   `target=../../dist` writes outside the folder. Now `target` must be a key of a fixed map, which
   also says who may upload there (only AGENT into `clinic`).
3. **Trusting the name.** The file name and `Content-Type` are whatever the client says. The type
   is read from the first bytes (`FF D8 FF` = JPEG, `89 50 4E 47 …` = PNG), and the server picks
   the name (`randomUUID()`), so a script renamed `photo.png` is refused.

And on the way back in: `clinicImages` accepts only paths of the form
`uploads/<folder>/<uuid>.(jpg|png)`. An outside URL in a clinic photo would let any clinic put a
tracking pixel — or a `javascript:` link — on every patient's screen.

### 7. Search: Atlas Search with a regex fallback

`$regex` with a leading wildcard cannot use an index, has no relevance order, no typo tolerance
and no Korean word splitting. Atlas Search (Lucene inside Atlas) has all of them, and needs no
second system to keep in sync — the reason it was chosen over Elasticsearch.

The index definition lives in `docs/atlas-search/clinics.json` (`lucene.nori` is the Korean
analyzer). It is created once in Atlas; `ATLAS_SEARCH_INDEX` names it. Empty, the service falls
back to an escaped regex on the two names, so local runs and the Postman suite work either way.
`$search` must be the first stage and already returns the best match first, so no `$sort` is
added unless the user asked for one. One caveat: the search index is updated a moment after the
write (eventual consistency), so a clinic approved a second ago may not be searchable yet.

### 8. Smaller things

- **`NotFoundException` showed up as `INTERNAL_SERVER_ERROR`.** `@nestjs/apollo` maps only 400,
  401, 403 and 422 to GraphQL codes. `formatError` now maps 404 to `NOT_FOUND`, so a client can
  tell "this does not exist" from "the server broke".
- **Public member data.** A follow list shows `PublicMember` (id, type, display name, image),
  never `Member`, which carries email and phone. Patients show as "Feride K.".
- **Audit log from the first decision.** Append-only `auditLogs`: the service has `record` and
  `get`, no update or delete. Refused attempts are not logged — only decisions that happened.
- **2dsphere and missing pins.** The GeoJSON sub-schema has no defaults: a half-built
  `{ type: 'Point' }` without coordinates makes the 2dsphere index reject the whole document.
  A clinic without a pin is simply skipped by the index.
- **The Postman `data` trap, again.** Six test scripts declared `const data` and failed with
  "Identifier 'data' has already been declared" — exactly the rule in `CLAUDE.md`.

### Interview questions and answers

**1. Two admins approve the same clinic at the same moment. How does your code make sure only one decision is recorded — without a lock?**

The expected status is part of the update filter: `findOneAndUpdate({ _id, clinicStatus: 'PENDING' }, …)`. MongoDB matches and modifies one document atomically, so the second admin's filter finds no PENDING clinic and gets "not allowed in the current status"; the audit log is written only after a successful update.

**2. What is TOCTOU? Show where it appeared in `updateMyClinic` and how the filter fixes it.**

Time of check to time of use: a decision based on a read is stale by the time of the write. `updateMyClinic` read PENDING (so renaming was allowed); an admin approved; the rename then landed on a verified clinic. Writing with `{ _id, clinicStatus: <status read> }` makes the write match nothing if the status moved.

**3. Why does clinic signup need a transaction, and why must the transaction callback be idempotent?**

The AGENT account and the clinic must exist together; a failure between two separate inserts leaves an account that owns nothing and whose email can never register again. `withTransaction` retries the callback on transient errors, so it may run more than once — the callback must only do database work inside the session, never send anything or set a cookie.

**4. A hot cache key expires and 500 requests arrive. Explain single-flight with `SET NX PX`. What happens if the request holding the lock crashes?**

The first request wins `SET lock:<key> 1 NX PX 3000` (NX: only if absent), rebuilds and stores the value; the others poll the cache for up to a second and read it. If the holder crashes, the lock expires after 3 seconds (PX) and the next request rebuilds — no deadlock. MedVia measured 50 concurrent misses → one rebuild.

**5. Why are `meLiked` / `meFollowed` not cached, and why are view counts allowed to be stale?**

They differ per viewer while the cached page is shared; caching them would show one patient's heart to everyone. View counts change on every first visit; invalidating on each would destroy the hit rate on exactly the popular pages, and a count 60 seconds behind harms no one.

**6. Nestar's like toggle reads first and then writes. What goes wrong under double clicks, and how does a unique index fix it?**

Two clicks both read "not liked", both insert and both increment — the counter moves twice. With a unique index on `{ memberId, likeRefId }` the write decides: delete first (an existing like → −1), otherwise insert; the twin insert fails with duplicate key 11000 and reports 0, so the counter moves once.

**7. An index `{ followingId, followerId }` exists, yet the query on `followerId` does a COLLSCAN. Why? What is the ESR rule?**

An index is used from its leftmost prefix; `followerId` is its second field, so the query cannot seek on it and scans the collection. ESR: Equality fields first, then Sort, then Range — `{ followerId: 1, createdAt: -1 }` serves "my followings, newest first" (20 000 → 10 documents examined).

**8. Why does a `$sort` placed inside `$facet` hurt, while the same `$sort` before it is free?**

Sub-pipelines inside `$facet` never use indexes, so a `$sort` there sorts every matched document in memory. Placed before `$facet`, right after `$match`, the same sort is delivered in order by the index.

**9. Name three ways a file upload endpoint can be attacked, and the defence for each.**

A vulnerable parser reached before authentication (graphql-upload's `dicer` crash) → parse after the guard, with size limits. Path traversal through a client-chosen folder → a fixed map of allowed targets. A spoofed type or name → check the magic bytes and generate the file name on the server. (Also: refuse image fields that are not our own upload paths.)

**10. When is copying a field into another collection (denormalising) safe?**

When the copied value cannot change after it is copied (a member's type), or when the copy is derived and fully recomputed from its source on every change (`clinicMinPrice`), so a missed update heals itself. Not when every writer of the source must remember to update the copy.

---

## M3 — Doctor

### 1. Visibility that depends on another collection

A doctor is public only while **two** statuses say so: `doctors.doctorStatus = ACTIVE` and the
clinic's `clinics.clinicStatus = ACTIVE`. On a single doctor page this is easy — read the doctor,
then the clinic. The hard case is the **list**: filter on both, sort, and cut page 2 of 10.

Three ways, measured on 1 000 clinics (10 % suspended) and 20 000 doctors, page of 10 plus the
total count, median of 7 runs against Atlas:

| Option | How | Time | Page of 10 (`explain`) |
| --- | --- | --- | --- |
| 1. `$lookup` | join every doctor to its clinic, then filter, then page | **1003 ms** | — |
| 2. flag | copy `clinicActive` onto each doctor, `updateMany` on every clinic change | **286 ms** | IXSCAN, 10 docs |
| 3. `$in` | cached list of active clinic ids, `clinicId: { $in: ids }` | **317 ms** | IXSCAN, 12 docs |

Option 1 is slow because the filter that decides visibility sits **after** the `$lookup`: every
doctor is joined before the database knows which ten to keep.

Option 2 is fastest, but the same fact now lives in two places. Every clinic status change
(approve, suspend, restore, delete) must fan out to all its doctors, and a crash between the clinic
write and the `updateMany` leaves doctors visible for a suspended clinic — so it needs a
transaction, and every future status path must remember it.

**Chosen: option 3.** One source of truth, the query stays on one collection and pages through
`{ doctorStatus, createdAt }`; the index hands over rows in order and the `$in` drops the two that
belong to suspended clinics (12 docs examined for 10 returned). The price is one cached key,
`clinic:active:ids`, dropped on any clinic change. It stops scaling when the `$in` list holds tens
of thousands of ids — that is the point to move to option 2.

Compare M2's `followingType`: copying a member's type was safe because it **never changes**. A
clinic's status changes; copying it is a synchronisation problem.

A trap found while writing it: the ids come back from the Redis cache as **strings**. A `$in` of
strings matches no `ObjectId` and returns nothing, silently. They are converted back before use.

### 2. Accounts created by someone else

A clinic creates its doctors — doctors never sign up. `createDoctor` reuses M2's
`createEmailMember(…, session)`: the DOCTOR account and the doctor page are inserted in one
transaction, so neither exists without the other.

The clinic chooses the password, so the account is flagged `memberMustChangePassword`. The server
does not block a doctor who ignores it (the mockup says the account "works right away"); the risk —
the clinic can sign in as the doctor until the password is changed — is written down in DECISIONS.

There is no email, so a doctor who forgets the password asks the clinic: `resetDoctorPassword`
sets a new temporary password and calls `endAllSessions` — every device, and every access token
through the M1 revocation key. Removing a doctor closes the account in the same transaction as
the `DELETE` status, then signs the doctor out after the commit.

### 3. Two actors, one status field

Clinic and admin can both hide a doctor. With one `HIDDEN` value, a clinic could undo an admin's
decision. So the state machine has two separate edges:

```
ACTIVE ◄──► HIDDEN      clinic   (hideDoctor / showDoctor)
ACTIVE ◄──► SUSPENDED   admin    (suspendDoctor / restoreDoctor, audit-logged)
```

`showDoctor` only moves `HIDDEN → ACTIVE`. Against a SUSPENDED doctor the filter matches nothing
and the clinic gets "not allowed in the current status".

**Ownership answers "not found", not "forbidden".** Another clinic asking to hide your doctor is
told the doctor does not exist. "Forbidden" would confirm the id is real — a small leak, but a
free one to avoid.

### 4. Clinic changes reach doctor pages through the cache, not through an import

`DoctorModule` imports `ClinicModule` (active ids, the clinic card). The reverse import would close
a cycle. But a suspended clinic must take its doctors' cached pages down at once. So
`ClinicService.invalidateClinic()` drops `clinic:active:ids`, `doctor:list:*` and `doctor:detail:*`
by key prefix — a dependency on key names, not on a module. Doctor detail keys do not carry the
clinic id, so the whole prefix goes; clinic changes are rare next to page reads, so that is cheap.
The Postman suite checks it: a cached doctor page disappears in the request right after
`suspendClinic`.

### 5. Recently Visited as one timeline, and "Clear history" that does not delete

The mockup shows clinics and doctors mixed, newest first. `getRecentlyVisited` returns
`{ viewGroup, visitedAt, clinic | doctor }` from one `views` query; the index became
`{ memberId, updatedAt: -1 }`.

"Clear history" sets `viewHidden: true` instead of deleting. A deleted row turns the next visit
into a *first* visit and the view counter grows each time a patient clears the history. A revisit
un-hides the row. The `updateMany` runs with `timestamps: false` — hiding is not a visit.

### 6. Atlas Search is eventually consistent

With `ATLAS_SEARCH_INDEX` switched on, an M2 test that searched for a clinic approved a second
earlier failed: the clinic was not in the search index yet. Thirty seconds later it ranked first.
Atlas Search reads a separate Lucene index that follows the collection a moment behind. (The fixed
wait added here was not enough — see M3.1, section "When the cache freezes the gap".)

One more finding: Korean search uses the `lucene.nori` analyzer, which splits words with a
dictionary. `포스트맨글로우피부과의원` is found by `포스트맨`, `글로우`, `의원` and
`피부과의원`, but not by `피부과` — nori keeps `피부과의원` as one word. Word-prefix matching would
need an `autocomplete` (edgeGram) mapping.

### Interview questions and answers

**1. A list must filter on a status stored in another collection and still paginate. Compare `$lookup`, a copied flag and an `$in` of ids. Which did you choose, and when would you switch?**

`$lookup` joins every doctor to its clinic before the page can be cut: 1003 ms on 20 000 doctors. A copied flag is fastest (286 ms) but needs a fan-out `updateMany` on every clinic status change and two sources of truth. A cached list of active clinic ids with `$in` keeps one source of truth and pages through an index: 317 ms. Chosen: `$in`; switch to the flag when the id list reaches tens of thousands.

**2. When is denormalising safe, and why was it safe for `followingType` but not for clinic status?**

Safe when the value cannot change after it is copied, or when the copy is recomputed from the source. `followingType` is a member's type, which never changes. A clinic's status changes (approve, suspend, restore), so every change would have to reach every doctor, and one missed update shows doctors of a suspended clinic.

**3. Your `$in` returned nothing, with no error. What happened?**

The ids came back from Redis as JSON strings. `$in` compares types strictly; a string never equals an ObjectId, so nothing matched and no error was raised. They are converted back to ObjectIds after the cache read.

**4. A clinic and an admin can both hide a doctor. How do you stop the clinic from undoing the admin?**

Two separate states with separate owners: the clinic moves ACTIVE ⇄ HIDDEN, the admin ACTIVE ⇄ SUSPENDED. `showDoctor` filters on `HIDDEN`, so against a SUSPENDED doctor it matches nothing and returns "not allowed in the current status".

**5. Why answer "not found" instead of "forbidden" when a clinic touches another clinic's doctor?**

"Forbidden" confirms the id exists and belongs to someone else — free information for anyone enumerating ids. "Not found" says nothing, and from that clinic's point of view the doctor indeed does not exist.

**6. "Clear history" — why not delete the rows?**

A deleted row makes the next visit a first visit again, so the view counter would grow every time a patient cleared the history. The rows are hidden (`viewHidden`), and a revisit un-hides them without counting again.

**7. Your search test fails right after a write and passes 30 seconds later. Explain.**

Atlas Search reads a separate Lucene index that is updated asynchronously from the database — eventual consistency. A document written a moment ago is not searchable yet; seconds later it is. The test retries instead of expecting the write to be visible at once.

---

## M3.1 — Refactor: one like, flags on every card

### The problem

1. **The same mutation, twice — and two more coming.** `likeTargetClinic` and `likeTargetDoctor`
   were the same twenty lines with a different model and counter. M8 adds articles and
   comments, which would have made four copies.
2. **Hearts only on the detail page.** A list card could not show whether the patient liked or
   followed it. Nestar did show it, with a reusable pipeline stage:
   `lookupAuthMemberLiked(memberId, '$_id')` — a `$lookup` into `likes` for every card, the second
   argument naming which field is the reference (`'$_id'`, `'$followingId'`, `'$followerId'`).
   It returned `meLiked: [{ memberId, likeRefId, myFavorite: true }]`, an empty array meaning "no".

### Why Nestar's stage could not be copied

- **Cache leak.** MedVia caches the list (`clinic:list:<hash>`) once for everyone. A per-viewer
  `$lookup` inside the cached pipeline would show the first patient's hearts to every visitor
  after them. Nestar had no cache, so it never met this problem.
- **An array where a boolean belongs.** The client had to read `meLiked?.[0]?.myFavorite`.
- **Guests paid for it.** With `memberId = null` the `$lookup` still ran for every card.

### What was kept: the reference parameter. What changed: where it runs.

```ts
const page = await cache.wrap(key, ttl, load);                         // same for everyone
const liked    = await likeService.likedIds(viewer._id, page.list.map((c) => c._id));
const followed = await followService.followedIds(viewer._id, page.list.map((c) => c.memberId));
page.list.map((c) => ({ ...c, meLiked: liked.has(String(c._id)), meFollowed: followed.has(String(c.memberId)) }));
```

The caller still chooses the reference field (`_id` for likes, `memberId` for follows) — Nestar's
flexibility — but the flags are applied **after** the cache, with **one `$in` query per page**
(10 cards, one query, served by the unique `{ memberId, likeRefId }` index), and guests cost
nothing. The detail page's `isLiked` / `isFollowing` became one-element calls of the same helpers,
so the logic lives in one place. The Postman suite proves the cache does not leak: the same
`getClinics` input asked by a patient and then by a guest returns the heart only to the patient.

### One `likeTarget` — the strategy pattern

```graphql
likeTarget(input: { likeGroup: DOCTOR, likeRefId: "…" }) { likeGroup likeRefId meLiked likes }
```

`LikeService` knows how to toggle a like. It does **not** know what a clinic or a doctor is. Each
likeable module registers a handler on boot:

```ts
// ClinicService.onModuleInit
likeService.registerTarget(LikeGroup.CLINIC, {
	isLikeable: (id) => clinic exists and is ACTIVE,
	moveLikes:  (id, ±1) => $inc clinicLikes, drop the cached page, return the new count,
	countLikes: (id) => current clinicLikes,
});
```

- **Open/closed.** M8 adds `ARTICLE` by registering a handler; `likeTarget` is not edited.
- **Dependency inversion.** Clinic and doctor import the like module; the like module never
  imports them. The handler is how the lower module calls back up without an import cycle.
- **The group decides where the id is looked up.** A member id sent as `CLINIC` is "not found",
  not a like on the wrong thing.

### When the cache freezes the gap

The M2 search test failed again on the user's run. A fixed 6-second wait was not enough: the
index lag varied between ~4 and ~8 seconds. The test was changed to retry (`setNextRequest`, up
to 15 × 2 s) — and still failed after 30 seconds. Atlas had long caught up; **our cache had not**.
The first attempt stored "not found yet" under `clinic:list:<hash>` for 60 seconds, and every retry
read that entry.

This is a product bug, not a test bug: a patient searching for a clinic right after it goes live
would get "not found" for a whole minute. Two eventually consistent layers in a row multiply
their staleness. The fix is to cache only what is worth caching:

| Request | Cached? | Why |
| --- | --- | --- |
| browse with filters (district, specialty, language) | yes, 60 s | few combinations, repeated by many visitors |
| text search | **no** | almost every query differs (low hit rate), and it reads an index that lags |

After the fix the test passed three runs in a row after 2, 3 and 4 retries — the real lag.

What stayed separate on purpose: `getClinics`, `getMyClinicDoctors`, `getAllDoctorsByAdmin`. One
query that changes its answer by role would mix permissions with filtering and would need the
role in every cache key — the leak above, in another shape.

### Interview questions and answers

**1. Nestar put `meLiked` into the list pipeline. Why does that break once the list is cached?**

The cached page is shared by all viewers. `meLiked` computed inside the cached pipeline belongs to whoever filled the cache, and every later visitor would see that person's hearts.

**2. How do you show "liked" on 10 cards with one query? Which index serves it?**

Load the page, then one query: `likes.find({ memberId, likeRefId: { $in: pageIds } })`, turned into a set and matched against each card. It is served by the unique `{ memberId, likeRefId }` index — equality on the member, `$in` on the targets.

**3. What is the strategy pattern here, and how does it keep `LikeService` closed for modification?**

Each likeable module provides an object with the same interface (`isLikeable`, `moveLikes`, `countLikes`), and `LikeService` picks one by `likeGroup`. A new likeable type registers a new handler; `likeTarget` itself is never edited — open for extension, closed for modification.

**4. The like module calls code in the clinic module without importing it. How?**

Dependency inversion: `LikeService` defines the `LikeTargetHandler` interface; the clinic module imports the like module and registers its handler in `onModuleInit`. The like module calls back through the interface it owns, so the import only points from clinic to like.

**5. Why not one `getDoctors` that returns different data for guests, clinics and admins?**

It would mix authorisation with filtering — every `if (role)` branch is a possible leak — and the cache key would need the role, or one role's results would be served to another. Separate queries with their own guards are easy to audit.

**6. A search right after a write returns nothing for a full minute, although the search index caught up in five seconds. What happened, and which requests should not be cached?**

The first search ran before the index caught up, and its "not found" was cached for 60 seconds; every later request read the cache, never the index. Text searches should not be cached: almost every query is different (low hit rate) and they read an index that lags. Repeated filter-only browsing is what is worth caching.

---

## M4 — Treatment

### 1. What an index is (asked during the review)

A sorted copy of one or more fields, each entry pointing at its document — the index at the back
of a book. Without one, MongoDB reads every document (`COLLSCAN`); with one it jumps to the right
place (`IXSCAN`). M2 measured it: 20 000 documents examined without, 10 with.

It is not free: every insert and update writes the document **and every index on it**, and
indexes want RAM. That is why the unused `views` index was dropped in M3.

MedVia uses two kinds:

| | Regular index (B-tree) | Search index (Atlas Search, Lucene) |
| --- | --- | --- |
| Stores | field values, sorted | word → list of documents containing it (inverted index) |
| Good for | `=`, `$in`, ranges, sort | words, typos (fuzzy), Korean morphology, relevance |
| Lives | inside MongoDB, updated with the write | in a separate process, seconds behind |

New this milestone: a **multikey** index on `doctorIds` (an array — one index entry per element,
so "treatments of Dr. Han" is an index lookup) and a **partial** index on
`treatmentDraft.submittedAt` (only documents that have a draft are in it, so the admin's edit
queue costs nothing for the thousands of treatments without one).

### 2. Draft and live: reviewing an edit without taking the page down

Medical-ad rules require an admin to check what a clinic advertises. A new treatment simply waits
(PENDING). An edit of a live treatment is harder: sending the treatment back to review would hide
it, and the clinic would lose bookings for a typo fix.

So a live treatment has two versions. The **live** fields keep serving patients; the edited
**ad-relevant** fields (name, category, note, description, photos) wait in `treatmentDraft`. On
approval the draft is copied over the live fields; on rejection it is dropped and the note says
why. Operational fields (doctors, duration, languages, aftercare) carry no advertising claim and
apply at once. Patients never see a draft — the public query projects it away.

**Price is split by direction**, because the risk is one-sided:

| Change | Applied | Why |
| --- | --- | --- |
| higher | at once | misleads no one; the clinic should not have to serve at the old price |
| lower | waits in the draft | "from ₩10,000" to draw patients in is exactly what the review catches |

A patient who already booked is unaffected either way: the booking (M5) stores a copy of the
price at that moment.

### 3. Optimistic concurrency: the admin approves what the admin saw

The admin opens an edit, reads it for a minute, clicks "Approve". Meanwhile the clinic changed
the draft. Without a guard, the approval would publish text no admin ever read.

Every change of the draft moves `treatmentDraft.submittedAt`. The review page sends back the
version it showed (`draftSubmittedAt`), and the approval filters on it:

```ts
findOneAndUpdate({ _id, 'treatmentDraft.submittedAt': seen }, { $set: draft, $unset: { treatmentDraft: 1 } })
```

If the version moved, the filter matches nothing and the admin is told to reload. No lock is held
while the admin reads — the check happens in the write. This is **optimistic concurrency control**;
the same idea as an HTTP `If-Match` / ETag, or a `version` column in SQL. The Postman suite
reproduces the race: approving the earlier version is refused, approving the current one works.

### 4. Derived data: rebuilt, not kept in sync

`clinics.clinicMinPrice` ("From ₩80,000") and `clinics.clinicTreatmentNames` (so one clinic search
finds "laser toning") are copies of treatment data. M3 rejected a copied `clinicActive` flag — so
why are these fine?

- **Recomputed from the source, written whole.** After every treatment change:
  `$group` over the ACTIVE treatments → `$min` price and the set of names → `$set` on the clinic.
  An `$inc`-style adjustment cannot work at all: hiding the cheapest treatment needs the
  *next*-cheapest, which only the source knows.
- **Idempotent.** Running the refresh twice gives the same result, so a retry is harmless, and a
  batch job (M9) can rebuild every clinic from scratch.
- **Self-healing.** If a refresh is lost (crash between the two writes), the next treatment change
  recomputes the truth. A synchronised flag stays wrong until someone notices.

The remaining window: two treatment changes of one clinic at the same moment can interleave so
the older refresh writes last. The value is then stale until the next change — acceptable for a
"from" price, and the M9 batch closes it.

### 5. Removing a doctor ripples into treatments

`removeDoctor` now also `$pull`s the doctor from every treatment of the clinic and hides the live
treatments left with no doctor (with a note saying why) — inside the same transaction as the
doctor and account changes. `showTreatment` refuses while no doctor is assigned: patients book a
doctor, not a treatment. The clinic summary is refreshed after the commit, because the hidden
treatment may have been the cheapest.

### 6. A test that passed for the wrong reason

The first version of "search by treatment name finds the clinic" passed — but the clinic name and
the treatment name shared the same timestamp token, so the clinic was found by its **own name**.
With a token only the treatment name has, the test failed as it should: the Atlas mapping did not
contain `clinicTreatmentNames` yet. A green test only proves something if it would fail without
the feature.

### Interview questions and answers

**1. What does an index cost on writes, and why did you drop one in M3?**

Every write updates the document and every index on it, and indexes want RAM. The `views` index `{ memberId, viewGroup, updatedAt }` was dropped in M3 because the query it served had been replaced — it only cost writes.

**2. What is a multikey index? A partial index? Where did you use each?**

A multikey index indexes an array field with one entry per element: `doctorIds`, so "treatments of Dr. Han" is an index lookup. A partial index includes only documents matching a filter: `treatmentDraft.submittedAt` for treatments that have a draft, so the admin's edit queue index stays tiny.

**3. How do you let an admin review an edit without taking the live page down?**

Keep two versions: the live fields keep serving patients, the edited ad-relevant fields wait in `treatmentDraft`. Approval copies the draft over the live fields; rejection drops it. Public queries never return the draft.

**4. Why does a price increase skip review while a decrease waits?**

The risk is one-sided: a lower advertised price can be bait, a higher one misleads no one — and the clinic should not be forced to serve at the old price. Patients who already booked are unaffected, because a booking stores its own copy of the price.

**5. The admin approves an edit the clinic changed a second ago. How do you stop that without a lock?**

Optimistic concurrency: every change of the draft moves its version (`submittedAt`); the admin sends back the version shown, and the approval filters on it. If the clinic changed the draft, nothing matches and the admin is asked to reload. No lock is held while the admin reads.

**6. You copy the minimum price onto the clinic. Why is that safe here when a copied status flag was not?**

It is derived data, recomputed from the ACTIVE treatments and written whole after every change: idempotent, rebuildable by a batch job, and a lost update heals on the next change. A copied status flag is adjusted by every writer and stays wrong as soon as one of them forgets.

**7. A test passed, yet the feature did not work. How did that happen, and how do you avoid it?**

The clinic name and the treatment name shared the same timestamp token, so the search found the clinic by its own name. Make the test data unique to the path under test, and confirm the test fails when the feature is missing.

---

## M4.1 — Unit tests with Jest

### 1. Jest had been here since M0 — with zero tests

`jest`, `ts-jest` and `@nestjs/testing` arrived with the Nest project template in the very first
commit, together with `npm test`. Nothing was ever written for them; every check so far went
through Postman/Newman. A project that ships a test runner and no tests reads worse than one
without the runner, so M4.1 gives it real work.

### 2. The testing pyramid: two kinds of test, two kinds of question

| | Newman (Postman, since M0) | Jest (since M4.1) |
| --- | --- | --- |
| Asks | does the running system answer correctly? | is this rule right for every input? |
| Needs | API, MongoDB, Redis | nothing — fakes stand in |
| Speed | minutes for M0–M4 | 39 tests in ~2.5 s |
| A failure says | "M4 / request 41 failed" — now go find why | "a lower price did not go to the draft" |
| Shape | few, broad, slow (top of the pyramid) | many, narrow, fast (bottom) |

They do not replace each other. Postman proves the pieces are wired together; Jest proves the
rules with combinations Postman could never afford — every M4 price/draft case through Postman
would need a clinic, doctors, a treatment and an admin approval each.

### 3. Functional core, imperative shell

`shapeDraft` and `normalizeHours` were `private` methods of services that also talk to MongoDB.
Testing them meant faking a model for every test. They were moved to `treatment.rules.ts` and
`clinic.rules.ts` as **pure functions**: input in, plan out, no database, no Nest, and even the
clock is a parameter (`planLiveEdit(current, fields, now)`) so the result is exact. The service
keeps the side effects — read, decide (by calling the rule), write. Behaviour did not change: the
M2 and M4 Postman folders passed after the move.

### 4. DI pays off: fakes instead of Redis and MongoDB

M0.1 promised that dependency injection lets a test hand a class a fake. Here it is:

```ts
Test.createTestingModule({
	providers: [CacheService, { provide: RedisService, useValue: { redis: new FakeRedis() } }],
});
```

`CacheService` gets thirty lines of in-memory Redis and never knows. The same fake records every
command, so the single-flight test can assert "50 concurrent misses → 50 `SET lock … PX 3000 NX`
attempts → the loader ran once", and a second fake whose every command throws proves "Redis
down → slower, never broken". `LikeService` gets a fake Mongoose model through
`getModelToken('Like')`; one test makes `create` throw duplicate key 11000 to replay the
double-click race without two real clicks.

### 5. A test is only worth something if it can fail

M4 had a green test that passed for the wrong reason. So every new test here was checked the
other way round — break the feature, watch the test go red, restore:

| Broken on purpose | Caught by |
| --- | --- |
| every price change applies at once | "sends a lower price to the draft" |
| every request takes the cache lock | "single-flight: 50 concurrent misses run the loader once" |
| a `null` result is not cached | "penetration: caches not found" |

This is **mutation testing** done by hand; tools such as Stryker automate it.

### 6. Green tests, red editor: who checks the types of a test?

After M4.1 the editor showed errors in every spec file ("Cannot find name 'jest'") and two real
type errors in `like.service.spec.ts` — while `npm test` passed 39/39. Two separate gaps:

- **ts-jest did not type-check.** The root `tsconfig.json` has `isolatedModules: true`, so ts-jest
  compiles each file on its own and only strips types; a wrong type in a test never fails a run.
- **No project included the specs.** `tsconfig.app.json` (the build) excludes `**/*spec.ts` on
  purpose, and `npm run typecheck` used it, so nothing ever type-checked the tests and the editor
  had no project telling it that `jest` globals exist.

Fix: `apps/medvia-api/tsconfig.json` — the file the editor picks for everything under
`apps/medvia-api` — includes `src/**/*` with `"types": ["node", "jest"]` and `noEmit`.
`npm run typecheck` now uses it, so app code and tests are type-checked together; the build keeps
`tsconfig.app.json`. Checked the same way as the tests: a deliberate type error in a spec now fails
`npm run typecheck`.

### Interview questions and answers

**1. What is the testing pyramid, and where do your Postman and Jest tests sit on it?**

Many fast, narrow unit tests at the bottom; few slow, broad end-to-end tests at the top. Jest is at the bottom — 39 tests in about 2.5 seconds, no database. Newman / Postman is at the top — the whole system, minutes per run. The bottom proves the rules for every input, the top proves the pieces are wired together.

**2. Why did you move `shapeDraft` out of the service before testing it?**

It was a private method of a service that talks to MongoDB, so testing it meant faking a model each time. As a pure function (`planLiveEdit`) with the clock passed in, it runs without a database, in milliseconds, with exact results — functional core, imperative shell.

**3. How do you test a class that needs Redis without running Redis?**

Through dependency injection: `Test.createTestingModule` gives `CacheService` an in-memory `FakeRedis` in place of `RedisService`, and the class never knows. The fake records commands for assertions, and a second fake that throws on every command proves the service degrades to the database when Redis is down.

**4. How do you reproduce a race condition (a double click) in a unit test?**

Fake the outcome of the race instead of racing: a fake model whose `create` throws duplicate key 11000 replays "the twin request inserted first", and the test asserts the counter does not move. For single-flight, real concurrency is cheap: 50 calls through `Promise.all`.

**5. Your tests are green. How do you know they would turn red if the feature broke?**

Break the feature on purpose, watch the test go red, restore it. In M4.1 the price rule, single-flight and the miss sentinel were each broken and each was caught by its own test — mutation testing by hand; Stryker automates it.

---

## M5 — Slot + Booking

### 1. The slot is the lock

Two patients pick Tue 22 Sep 10:00 with Dr. Han at the same second. Exactly one may get it.

The slot document itself is the lock. Taking it is one **conditional write**: "set HELD *if* it is
still free". The condition and the change happen in one atomic step inside MongoDB, so there is no
gap between "check" and "write" for the other request to slip through (no TOCTOU):

```ts
updateMany(
	{ _id: { $in: slotIds }, $or: [{ slotStatus: 'OPEN' }, { slotStatus: 'HELD', holdExpiresAt: { $lte: now } }] },
	{ $set: { slotStatus: 'HELD', holdMemberId, holdExpiresAt: now + 10 min } },
)
// modifiedCount !== slotIds.length → throw → the transaction rolls back
```

A 60-minute treatment needs **two** slots (`ceil(60 / 30)`). If 10:00 is free and 10:30 is not,
`updateMany` would take one and leave the patient with half a booking. That is why it runs in a
**transaction**: fewer than n changed → throw → nothing is held.

The race in detail: both transactions write the same slot document. MongoDB lets the first commit
and gives the second a `WriteConflict`; `withTransaction` retries it automatically, the "free"
filter no longer matches, `modifiedCount` is short, and the second patient gets
"This time is no longer available". The Postman suite replays it: Feride holds 10:00, Yahyo's hold
on 10:30 (which overlaps) is refused.

Why not Redis `SETNX`? The slot and the booking must change together. A lock in Redis and the
booking in MongoDB are two systems that can disagree, and the failure mode is a double-booked
patient. Redis stays cache and queue only.

The unique index `{ doctorId, slotStart }` is a second guard of a different kind: it makes
"Add slots" idempotent. Slots are created with an upsert per time (`$setOnInsert`), so running the
same request twice creates nothing new and never touches a slot that is already booked.

### 2. Lazy expiry: time-based state without a job

A hold lasts 10 minutes; a request waits at most 24 hours for the clinic. Something has to "free"
them when time runs out — but the BullMQ job that would do it comes only in M9.

The trick: **do not free them; define them as free.** Every slot carries `holdExpiresAt`, and the
"free" filter above already accepts a HELD slot whose time has passed. Nothing has to run at 10:10
for the slot to be available at 10:10. The same for bookings: `effectiveStatus()` reads a PENDING
booking past its `respondDeadline` as EXPIRED, every list filters it that way (`statusMatch`), and
the next write that touches it stores EXPIRED for real. M9's job becomes housekeeping, not
correctness.

One field, two meanings, on purpose: while the form is open `holdExpiresAt` is now + 10 min; once
the request is sent it becomes the clinic's `respondDeadline`. "When does this hold die?" has one
answer in one place.

### 3. A state machine as a table

Seven statuses, three actors (patient, clinic, admin), time conditions. Written as `if`s in the
service this becomes unreadable. Instead `booking.rules.ts` holds a table:

```ts
PENDING:   { CONFIRMED: [CLINIC], DECLINED: [CLINIC], CANCELLED: [PATIENT, ADMIN] },
CONFIRMED: { COMPLETED: [CLINIC], NO_SHOW: [CLINIC], CANCELLED: [PATIENT, CLINIC, ADMIN] },
```

plus a few time rules (a patient cancels a confirmed visit up to 24 hours before; COMPLETED and
NO_SHOW only after the start; decline needs a reason). Anything not in the table is refused — the
Jest suite walks every from × to × actor combination (196) and checks the 187 that are not allowed.
One mutation, `updateBookingStatus`, serves all three actors; a new rule is a row, not a branch.

The actor comes from the token (`USER → PATIENT`, `AGENT → CLINIC`), never from input. A doctor is
no actor at all: doctors read bookings, the clinic account changes them.

The write is conditional on the status that was read (`{ _id, bookingStatus: 'PENDING' }`), the same
optimistic check as M4's draft approval: a clinic confirming while the patient cancels — one wins,
the other gets "not allowed in the current status".

### 4. Scope from the token: one query for four roles, and no IDOR

"My Bookings", the clinic's list, the doctor's list and the admin's list are one query,
`getBookings`. The filter that decides *whose* bookings is built from the token:

```ts
USER → { memberId }   AGENT → { clinicId of my clinic }   DOCTOR → { my doctorId }   ADMIN → {}
```

Input filters (`clinicId`, `doctorId`, status, tab) are **AND**ed onto it — they can only narrow.
**IDOR** (Insecure Direct Object Reference) is the bug where an API trusts an id from the request:
`getBookings(clinicId: "someone else's")` returns someone else's data. Here Yahyo passes the
clinic's id and still sees only his own bookings — the Postman test was checked by removing the
scope on purpose: it went red.

Trade-off of one door for four roles: one bug exposes everyone. So the scope is a pure function
with its own tests, and every role has a "cannot open someone else's booking" case in Postman.

### 5. Field-level encryption of the questionnaire

Atlas already encrypts the disk and the network. That protects against a stolen disk, not against
someone who can *read* the database: a Compass session, a leaked `mongodump`, a leaked connection
string. Health data is "sensitive data" under PIPA, so the answers are encrypted by the API before
they are written:

```
v1 : <iv, 12 random bytes> : <GCM tag, 16 bytes> : <ciphertext>
```

- **AES-256-GCM**, Node's own `crypto` — no package. 256-bit key = 32 bytes, from
  `openssl rand -base64 32`, in `MEDICAL_ENC_KEY`; boot fails unless it is exactly that.
- **A new IV every time**, so the same answer never encrypts to the same text (no patterns).
- **The GCM tag** makes it authenticated: one changed byte in the database and decryption throws
  instead of returning garbage.
- **`v1`** names the key, so the key can be rotated later without guessing which rows used which.
- Decryption happens only after the scope check, and only for the patient, the clinic and the
  doctor of that booking. The admin handles bookings, not medical data. Lists never decrypt.

What it does not protect: a compromised API server holds the key. Encryption guards the database;
the scope guards the API — neither replaces the other. Losing the key loses every questionnaire.

### 6. Snapshots: what was agreed, not what is true now

`bookingPrice` is a copy of `treatmentPrice` at the moment the request is sent; M4's "a higher
price applies at once" is safe because of it. Consents are snapshots too: `{ consentType, agreed,
version: 'share-v1', agreedAt }`, with the version and time stamped by the server — the client only
says `agreed`. If the text changes to `share-v2`, this booking still proves which text the patient
accepted. Reference when you want "the current value" (the clinic's logo), snapshot when you want
"what was agreed" (price, consent).

### 7. Seoul time without a library

Dates are stored in UTC and shown in Asia/Seoul. Korea has no daylight saving time, so Seoul is
always UTC+9 and the conversion is arithmetic (`Date.parse('2026-09-22T00:00:00Z') + minutes − 9h`),
not a timezone database. Schedule input is wall-clock (`"2026-09-22"`, `"10:00"`) because that is
what a clinic means; the server turns it into instants. The trap the tests cover: 08:00 in Seoul is
the previous day in UTC.

### 8. What Postman cannot test, Jest does

The clock decides half the rules: a request expires after 24 hours, a confirmed visit can be
cancelled until 24 hours before, COMPLETED only after the start. Postman cannot wait a day, so
those live in `booking.rules.ts` with the clock as a parameter and are tested there. Postman covers
what needs the real system: the transaction, the race, the scopes, the encryption round trip.

Checked the M4.1 way — broken on purpose, watched red, restored:

| Broken on purpose | Caught by |
| --- | --- |
| a patient may confirm | the table walk, "refuses a patient confirming" |
| no 24-hour cancel limit | "cancel a confirmed booking only up to 24 hours before" |
| Seoul offset 0 | every Seoul time test |
| consents not required | "refuses a required consent missing / not agreed" |
| a patient's scope is `{}` | Jest "scopes every role" and Postman "no IDOR" |
| `ceil` → `floor` for slots | "31 minutes → 2 slots" |
| a fixed IV | "a different value for the same text every time" |
| the admin gets decrypted answers | Postman "the admin gets no medical answers" |

### Interview questions and answers

**1. Two patients book the same slot at the same moment. What happens?**

The slot is taken with one conditional write inside a transaction: "set HELD if still free". Both transactions write the same document; MongoDB commits one and gives the other a WriteConflict, `withTransaction` retries it, the filter no longer matches, and that patient is told the time is gone. No Redis lock — the slot and the booking must change together in one system.

**2. A 60-minute treatment needs two slots. Why a transaction, and not just `updateMany`?**

`updateMany` is atomic per document, not across documents. If 10:00 is free and 10:30 is not, it would take one and leave half a booking. In a transaction the count is checked, and a short count throws and rolls back everything.

**3. Holds expire after 10 minutes, but you have no background job yet. How do they expire?**

Lazily. The "free" filter treats a HELD slot past `holdExpiresAt` as OPEN, and a PENDING booking past its deadline is read as EXPIRED everywhere, then written as EXPIRED on the next touch. Correctness never waits for a job; M9's job only tidies.

**4. How do you keep a booking state machine maintainable?**

A transition table — from → to → which actors — plus a few time rules, all in pure functions. The service reads the status, asks the table, and writes conditionally on the status it read. A unit test walks every combination of status, status and actor.

**5. One `getBookings` serves patients, clinics, doctors and admins. How is that not an IDOR hole?**

The scope comes from the token, never from input: a patient's filter is always their own `memberId`. Input filters are ANDed on and can only narrow. A test passes another clinic's id as a patient and must get nothing — and it was checked by removing the scope on purpose.

**6. Atlas already encrypts data at rest. Why encrypt the questionnaire yourself?**

Disk encryption protects a stolen disk; anyone who can read the database still sees plain text. Field-level AES-256-GCM in the API means a dump or a Compass session shows only ciphertext. GCM also detects tampering, a random IV hides repeated answers, and a key version allows rotation. The key lives only in the API's environment.

**7. Why does the booking store the price and the consent version instead of referencing them?**

They are facts about the agreement, not current values. The clinic may raise the price or change the consent text tomorrow; the booking must still show what this patient accepted.

---

## M6 — Review

### 1. "Verified" is a rule, not a badge

A review is worth something only if the writer really had the visit. So the review hangs off the
booking, not off the clinic: `createReview(bookingId)` loads the booking **scoped to the caller**
(another patient's booking is "not found"), and `checkCanReview` demands COMPLETED, a
`completedAt` within 30 days, and no earlier review. COMPLETED itself can only be set by the
clinic after the visit started (M5's table) — the chain of rules is what makes "Verified visit"
true.

One review per visit is guarded twice:

- `bookings.bookingReviewed` is set by a **conditional** update inside the review's transaction
  (`bookingReviewed: { $ne: true }` in the filter) — two "Publish" clicks, the second finds it set;
- the unique index on `reviews.bookingId` refuses a second document even if the first guard had a
  bug.

Delete is **soft and final**: the flag never goes back to false and the document stays, so a
patient cannot delete a bad review and write a better one for the same visit (rating gaming).

### 2. Moderation as a table, with the M4 version check

Korean medical-ad rules treat a published review as advertising, so a review waits (PENDING) for
an admin. `MODERATION` in `review.rules.ts` is the whole policy:

```
PENDING        APPROVE → ACTIVE   REQUEST_CHANGES → EDIT_REQUESTED   REJECT → HIDDEN
ACTIVE                            REQUEST_CHANGES → EDIT_REQUESTED   REJECT → HIDDEN   (a complaint)
EDIT_REQUESTED                                                       REJECT → HIDDEN
HIDDEN         APPROVE → ACTIVE
```

Every non-approval needs a message to the patient, and may carry structured flags
(`GUARANTEED_RESULT`, `PERSONAL_DATA`, …) — the "why" in a form a UI can show. The write filters on
the `submittedAt` the admin read: if the patient edited the review in the meantime, the decision is
refused — the M4 optimistic check, reused.

A patient's edit sends the review back to PENDING, even a published one. M4 needed a draft/live
split because hiding a treatment loses bookings; a review that disappears for a few hours loses
nothing, so the simpler rule wins.

### 3. The rating: derived data again

`clinicRating` / `clinicReviews` and `doctorRating` / `doctorReviews` live on the cards (lists sort
by them), but they are **recomputed**, never incremented: after any change that moves a review in
or out of ACTIVE (`movesRating`), a `$group` by star over the ACTIVE reviews gives the count and the
average, written whole with `$set` — exactly how M4 keeps `clinicMinPrice`.

Why not `$inc`? A rating needs a sum and a count kept in step through approve, hide, restore, edit
and delete; one missed or doubled event and it is wrong forever. The recompute is idempotent and
heals on the next change; a batch (M9) can rebuild everything. Reviews change rarely, so the cost
is irrelevant.

The five bars ("5 → 86%") are not stored at all: `getReviews` computes them in a `$facet` branch
next to the page, over every published review of the filter. "Needs reply" narrows the list branch
only, so the dashboard bars still show all reviews.

`summarize()` returns 0 for no reviews (never `NaN`) and rounds to one decimal (4.25 → 4.3).

### 4. Public and private views of the same document

The same review is seen four ways: the patient (with the admin's note and flags), the admin (all),
the public and the clinic (published only, patient as "Feride K.", no note, no flags). Public
queries strip the note in the projection **and** in `present()`. Honest note on testing: when the
projection and the strip were removed on purpose, the Postman test did not turn red — an ACTIVE
review never has a note, because APPROVE clears it. The strip is defence in depth for a state
that cannot occur today; the test guards the flags, which do reach public cards if not removed.

### 5. Testing time: a test-support mutation, locked twice

M5's rules make a COMPLETED booking impossible in a test run: a booking starts at least 3 hours
ahead, COMPLETED only after the start. Options were a seed script (Postman would not know its ids),
Jest only (the real wiring untested), or a helper that moves a booking into the past.

`devShiftBookingTime(bookingId, hours)` shifts the booking's dates and its slots in one transaction.
Everything after it — COMPLETED, the review rules, the rating — runs through the real mutations;
only the clock is faked. It is registered only when `ENABLE_TEST_SUPPORT=true` **and**
`NODE_ENV !== 'production'`: in production the mutation is not in the GraphQL schema at all, so
there is nothing to call or to guess. The M6 folder checks the flag first and says how to fix it.

### 6. What the tests proved

| Broken on purpose | Caught by |
| --- | --- |
| any booking status may be reviewed | Jest "refuses a CONFIRMED / CANCELLED / NO_SHOW booking" |
| no 30-day window | Jest "refuses after 30 days" |
| a second review allowed | Jest "refuses a second review" |
| hide without a message | Jest "needs a message unless it approves" |
| EDIT_REQUESTED may be approved | Jest table walk |
| a PENDING change moves the rating | Jest `movesRating` |
| the average not rounded | Jest `summarize` |
| no rating refresh after moderation | Postman "rating 5 from one review", "(5 + 3) / 2 = 4.0", "a hidden review leaves the rating" |
| any doctor may reply | Postman "Dr. Kim was not the doctor of this visit" |
| the admin's note in public lists | **not caught** — see 4 |

### Interview questions and answers

**1. How do you make sure a review comes from a real patient of that clinic?**

The review is written for a booking, not a clinic. The booking is loaded scoped to the caller, must be COMPLETED — which only the clinic can set, and only after the visit started — and within 30 days. The clinic, doctor and treatment are copied from the booking, never taken from input.

**2. Two clicks on "Publish" — how do you stop two reviews?**

The booking's `bookingReviewed` flag is set by a conditional update inside the same transaction as the insert; the second click finds it set. A unique index on `reviews.bookingId` is the backstop. Delete is soft, so the index also blocks "delete and write again".

**3. Why recompute the rating instead of `$inc`?**

A rating is a sum and a count that must stay in step through approve, hide, restore, edit and delete. One missed event and an incremented value is wrong forever. Recomputing from the published reviews is idempotent, heals on the next change and can be rebuilt by a batch; reviews change rarely, so it is cheap.

**4. The admin approves a review the patient edited a second ago. What happens?**

The moderation write filters on the `submittedAt` the admin read. The edit moved it, so nothing matches and the admin is asked to reload — optimistic concurrency, the same as treatment drafts in M4.

**5. How do you test something that needs time to pass, without a back door in production?**

Fake only the clock: a test-support mutation moves a booking into the past, and everything after it runs through the real code. The module is imported only when an explicit flag is set and the environment is not production, so in production the mutation does not even exist in the schema.

**6. A test passed when you broke the feature. Is the test useless?**

It showed the state it guards cannot occur: an ACTIVE review never carries the admin's note, because approval clears it. The strip stays as defence in depth, and the finding is written down instead of pretending the test proves more than it does.

---

## M7 — Chat (Socket.IO)

### 1. Why a chat needs push

HTTP — and GraphQL over it — is request → response: the browser asks, the server answers. When
the clinic replies to Feride, her browser has asked nothing, yet it must show the message now.

| Way | How | Cost |
| --- | --- | --- |
| Polling | ask "anything new?" every 2 s | 99 % empty requests, up to 2 s late |
| SSE | one HTTP response kept open, the server streams into it | server → client only |
| WebSocket | one long-lived two-way connection | reconnect, groups and auth are yours to write |
| Socket.IO | a library on top of WebSocket | a client library on the other side too |

Socket.IO adds what a raw WebSocket lacks: automatic reconnect, **rooms** (`io.to('x').emit` reaches
every socket in group x), auth data in the handshake, a long-polling fallback, and a Redis adapter
when there is more than one server. Nestar's raw `ws` is exactly what CLAUDE.md says not to port.

Honest note: MedVia pushes only server → client (messages are sent through GraphQL), so SSE or
GraphQL subscriptions would also do. Socket.IO was chosen for rooms and reconnect out of the box,
room for two-way features later ("typing…"), and because job postings ask for it.

### 2. Write through GraphQL, push through the socket

`sendMessage` is a GraphQL mutation, not a socket event. One write path means one place for the
ValidationPipe, the role guard, the throttler and the Postman tests. The order matters: **save
first, push second**. A message exists before anyone is told about it; a socket that is down only
loses the push, and the next history read has the message.

### 3. Rooms are audiences, not conversations

A socket joins one Socket.IO room: `member:<id>` for a patient, `clinic:<id>` for the clinic account
(every tab of the team). A chat room's events go to `[member:<patient>, clinic:<clinic>]`. The
alternative — one Socket.IO room per conversation — needs every socket to join every new
conversation as it appears; with audiences a new conversation needs no join at all, and the clinic
gets all of them through one room.

### 4. Socket auth: once in the handshake, cut at expiry

The access token travels in `handshake.auth.token` and is checked in a handshake **middleware** —
a refused socket never connects; the client gets `connect_error` with the reason. `TokenService`
got a `verifyToken(token)` shared with the HTTP guards (signature, expiry, Redis revocation).

A WebSocket lives for hours, a token 15 minutes. Without more, a member blocked at minute 5 keeps
receiving messages on the open socket. So the server **cuts the socket when its token expires**;
the client refreshes through the cookie and reconnects, and a revoked member cannot. (Checked by
reasoning, not by a test — the suite would have to wait 15 minutes.)

### 5. Cursor paging, not page numbers

New messages keep arriving at the top. With `skip`, "page 2" shifts under the reader the moment a
message arrives — one message is shown twice or skipped. The cursor is the position of the oldest
message already shown, `{ createdAt, _id }` (the id breaks ties inside one millisecond), base64url
so the client treats it as opaque. The next page is "strictly older than the cursor", served by the
`{ roomId, createdAt, _id }` index; one extra row is read to know whether another page exists.

### 6. One message, two languages, one preview

A message keeps `messageText` in `messageLang` as written, plus `messageTranslations[]` (AI-1).
Each side reads `textFor(message, viewerLang)`: the original if it is in their language, else the
translation, else the original. That is also why the room stores `roomLastMessageId`, not a copy of
the last text: the patient's list needs it in Russian, the clinic's in Korean, and the message
holds both.

`roomUnreadPatient` / `roomUnreadClinic` are state, not counters that must stay in step with
anything: `$inc` on each message from the other side, `0` on `markRoomRead`.

### 7. Bookings write into the chat — one way

`createBooking` opens the patient's room with the clinic and adds "Booking request · Glow Facial ·
2026-10-11 10:00 KST"; confirm, decline, cancel, complete and no-show add their own line. The
booking module imports the chat module, never the reverse. The line is posted **after** the
booking committed and can never fail it — a lost line is logged, the booking stands.

### 8. Flood control per member

`sendMessage` is limited to 20 a minute. The existing login throttler counts per IP + email;
for a chat that would put a whole clinic team behind one office IP under one limit. The chat guard
counts per member, and the socket test proves Yahyo's limit does not touch Feride.

### 9. What the tests proved

| Broken on purpose | Caught by |
| --- | --- |
| a patient = a clinic side | Jest `sideOf` |
| wrong unread field | Jest `otherUnread`; Postman "3 unread", "1 unread" |
| paging forgets the tie-break | Jest `olderThan` |
| the room scope removed | Postman "Yahyo cannot write / read in Feride's room" |
| events emitted to everyone | socket test "Yahyo receives nothing" |
| no auth in the handshake | socket test "a socket without a token is refused" |

### Interview questions and answers

**1. Why did you send messages through GraphQL instead of the socket?**

One write path: validation, role guards, throttling and the Postman tests apply as for every other mutation. The socket only pushes. The message is saved before the push, so a lost push is repaired by the next history read.

**2. How do you authenticate a WebSocket, and what happens when the token expires?**

The access token goes in the handshake and is verified in middleware — a refused socket never connects. Because the connection outlives the 15-minute token, the server disconnects the socket at the token's expiry; the client refreshes and reconnects, which a blocked member cannot.

**3. Why cursor pagination for chat history?**

New messages are inserted at the top; offset paging shifts and repeats or skips messages. A cursor on `{ createdAt, _id }` asks for "older than this one", is stable under inserts and uses the index.

**4. How would this run on three API servers?**

A socket is connected to one server, but the message may be saved on another. The Socket.IO Redis adapter publishes every emit through Redis so each server delivers it to its own sockets. With audiences as rooms nothing else changes. MedVia runs one instance, so it is noted, not installed.

**5. A clinic team works in five tabs. How does each tab get the message once?**

All five sockets join `clinic:<id>`; one emit to that room reaches each socket once. Emitting to `[member:<patient>, clinic:<clinic>]` also delivers once per socket even if a socket were in both.

**6. Why is the last message a reference and not a copy?**

The two sides read it in different languages. A copy would need both languages duplicated on the room and updated when the translation arrives; a reference reads the message, which already holds both.
