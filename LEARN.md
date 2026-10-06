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
