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
