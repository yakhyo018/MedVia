# Deploy — medvia.tech (Docker Compose)

The portfolio site on one VPS: `https://medvia.tech` (Next.js) and `https://api.medvia.tech`
(NestJS API + Socket.IO). MongoDB stays on Atlas; Redis, the API, the batch, the web app, nginx
and certbot run in Docker Compose. Synthetic demo data only (`DEMO_MODE=true`).

```
                 ┌──────────── VPS (Docker Compose) ─────────────┐
 browser ──443──▶│ nginx ──▶ web:4000   (next start)              │
                 │       └─▶ api:3000   (GraphQL, /uploads, WS)   │──▶ MongoDB Atlas
                 │           batch:3001 (cron + BullMQ) ─▶ redis  │
                 └────────────────────────────────────────────────┘
```

## 1. Server (once)

Hostinger KVM 1 (1 vCPU, 4 GB) with Ubuntu 24.04, your SSH key.

```bash
# as root on the server
apt update && apt upgrade -y
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
# 2 GB swap: `next build` peaks at 1–2 GB
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Docker Engine + Compose plugin (Docker's apt repository)
curl -fsSL https://get.docker.com | sh
```

## 2. DNS (at the medvia.tech registrar)

Three **A** records to the server's IPv4: `@`, `www`, `api`. Check: `dig +short api.medvia.tech`.

## 3. MongoDB Atlas

- A separate database for the site, e.g. `.../medvia-demo` — never the development one.
- Network Access: add the server's IP.

## 4. Code and `.env`

```bash
mkdir -p /opt/medvia && cd /opt/medvia
git clone -b main https://github.com/yakhyo018/MedVia.git
git clone -b main https://github.com/yakhyo018/MedVia-next.git
cp MedVia/.env.example MedVia/.env && nano MedVia/.env
```

`.env` for production — **new secrets, none from development**:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DEMO_MODE` | `true` |
| `MONGO_PROD` | the Atlas URI of the demo database |
| `SECRET_TOKEN` | `openssl rand -base64 32` |
| `MEDICAL_ENC_KEY` | `openssl rand -base64 32` (keep a copy) |
| `FRONTEND_URL` | `https://medvia.tech` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the real admin; a new password of 16+ characters |
| `SEED_PASSWORD` | 16+ characters — every `@seed.medvia.test` demo login uses it |
| `AI_PROVIDER` | `openrouter` (a separate `medvia-demo` key) |
| `OPENROUTER_API_KEY`, `AI_MODEL_*` | as in development |
| `ENABLE_TEST_SUPPORT` | `false` |

`REDIS_URL` and the ports are set by the compose file.

## 5. First start

```bash
cd /opt/medvia/MedVia/deploy
./init-letsencrypt.sh you@example.com          # builds the images, HTTPS for the three names
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm tools npm run seed:admin
docker compose -f docker-compose.prod.yml run --rm tools npm run seed:demo
```

Renewal reload, daily: `crontab -e` → `0 4 * * * /opt/medvia/MedVia/deploy/renew.sh >/dev/null 2>&1`

## 6. Check

```bash
curl -s https://api.medvia.tech/graphql -H 'content-type: application/json' -d '{"query":"{__typename}"}'
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

In a browser: sign up / log in (the refresh cookie survives a reload), a clinic page with
photos, a booking request, chat between `feride@` and `clinic01@`, the assistant, `/_admin`, a
phone.

## 7. Updates

```bash
cd /opt/medvia/MedVia && git pull && cd ../MedVia-next && git pull
cd ../MedVia/deploy && docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f                           # old layers fill the 50 GB disk otherwise
```

## 8. New seed photos later

Add the files to `apps/medvia-api/src/scripts/seed/photos/clinics|doctors/` (licensed stock, source
in `SOURCES.md`), commit, push. On the server, after `git pull`:

```bash
docker compose -f docker-compose.prod.yml build tools
docker compose -f docker-compose.prod.yml run --rm tools npm run photos:attach
```

## Notes

- One image for the API and the batch (`Dockerfile` target `runtime`); `tools` is the `build`
  stage (sources + ts-node) for the one-off scripts, writing to the same `uploads` volume.
- Never run `seed:demo -- --reset` on the site after real sign-ups: it deletes only seed data,
  but every demo id changes.
- `trust proxy` is 1: nginx is the only hop.
