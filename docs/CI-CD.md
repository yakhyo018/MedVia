# CI/CD — GitHub Actions

Both repositories have `.github/workflows/ci-cd.yml`:

| Job | When | What |
| --- | --- | --- |
| `ci` | every push to `main`, `develop`, `feature/**`, `fix/**`, `chore/**`, and every PR to `main` / `develop` | API: `npm ci` → typecheck → lint → Jest. Web: `yarn install --frozen-lockfile` → typecheck → lint → `i18n:check` → `next build` |
| `deploy` | a push to `main`, after `ci` passed, only when the repository variable `DEPLOY_ENABLED` is `true` | SSH to the server → `ci-deploy.sh api` / `web` → the repository's `deploy.sh` → wait until `https://api.medvia.tech` / `https://medvia.tech` answers |

Postman is not in CI: it needs a running API and a database.

## One-time setup

### 1. A key only for GitHub Actions (laptop)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/medvia_ci -N "" -C "github-actions medvia"
```

### 2. The forced command (server)

`/home/MedVia-project/ci-deploy.sh` — the only thing the CI key may run:

```bash
#!/bin/bash
# Run by GitHub Actions through a forced SSH command: with its key only these two deploys are possible.
set -e
case "$SSH_ORIGINAL_COMMAND" in
	api) cd /home/MedVia-project/MedVia && ./deploy.sh ;;
	web) cd /home/MedVia-project/MedVia-next && ./deploy.sh ;;
	*) echo "unknown deploy target: $SSH_ORIGINAL_COMMAND" >&2; exit 1 ;;
esac
```

```bash
chmod 700 /home/MedVia-project/ci-deploy.sh
```

### 3. Authorize the key with that command (server)

Append one line to `/root/.ssh/authorized_keys` — the restrictions, a space, then the whole content of
`~/.ssh/medvia_ci.pub` from the laptop:

```
command="/home/MedVia-project/ci-deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA… github-actions medvia
```

Check from the laptop — it must print `unknown deploy target: hello` and deploy nothing:

```bash
ssh -i ~/.ssh/medvia_ci root@72.60.193.188 hello
```

### 4. The server's host key (laptop)

```bash
ssh-keyscan -t ed25519 72.60.193.188
```

### 5. Secrets and the switch (GitHub, both repositories)

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `DEPLOY_HOST` | `72.60.193.188` |
| Secret | `DEPLOY_USER` | `root` |
| Secret | `DEPLOY_SSH_KEY` | the whole private key: `cat ~/.ssh/medvia_ci` (from `-----BEGIN` to `END … KEY-----`) |
| Secret | `DEPLOY_KNOWN_HOSTS` | the line printed in step 4 |
| Variable | `DEPLOY_ENABLED` | `true` (set `false` to stop automatic deploys) |

### 6. Optional: protect `main`

Settings → Branches → Add rule for `main` → Require status checks to pass → `Typecheck, lint, test`
(API) / `Typecheck, lint, i18n, build` (web). A red CI then blocks the merge.

## Day to day

- Push a branch → the Actions tab shows `ci`; a red ❌ links to the failing step.
- Merge to `main` → `ci`, then `deploy` (Actions tab → the run → `Deploy to …`).
- A deploy recreates the containers, which install and build inside: the API is down ~1–2 min, the
  site ~3 min. Building images in CI and shipping them would cut this to seconds — the next step.
- Manual deploy still works: `cd /home/MedVia-project/MedVia && ./deploy.sh`.
