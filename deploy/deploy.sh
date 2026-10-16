#!/bin/bash
# PRODUCTION update of medvia.tech: both repositories to the latest commit of a branch, then the
# images are rebuilt and only the changed containers restart. On the server:
#   /opt/medvia/MedVia/deploy/deploy.sh            # main
#   /opt/medvia/MedVia/deploy/deploy.sh develop    # another branch (a check before a merge)
# The server runs only what is in git: edits to tracked files there are thrown away
# (reset --hard). .env, deploy/.env and the Docker volumes (uploads, certificates, Redis) are not
# tracked, so they stay. The first start is different: README §5 (init-letsencrypt.sh).
set -euo pipefail

# Everything runs inside main(): bash reads a script while running it, and the git steps below
# may replace this very file — a function is parsed whole before the first step runs.
main() {
	BRANCH="${1:-main}"
	DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
	ROOT="$(cd "$DEPLOY_DIR/../.." && pwd)" # /opt/medvia: MedVia and MedVia-next side by side
	COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml")

	for repo in MedVia MedVia-next; do
		echo "── $repo → origin/$BRANCH"
		git -C "$ROOT/$repo" fetch --prune origin "$BRANCH"
		git -C "$ROOT/$repo" reset --hard
		git -C "$ROOT/$repo" checkout -B "$BRANCH" "origin/$BRANCH"
		git -C "$ROOT/$repo" log -1 --format='   %h %s (%cr)'
	done

	echo "── build and restart"
	"${COMPOSE[@]}" up -d --build --remove-orphans

	# Both apps must answer from inside their containers before the update counts as done.
	echo "── health"
	healthy() {
		"${COMPOSE[@]}" exec -T api wget -qO- --header='content-type: application/json' \
			--post-data='{"query":"{__typename}"}' http://localhost:3000/graphql >/dev/null 2>&1 &&
			"${COMPOSE[@]}" exec -T web wget -qO- http://localhost:4000/ >/dev/null 2>&1
	}
	for _ in $(seq 1 30); do
		if healthy; then
			echo "   api and web answer"
			break
		fi
		sleep 2
	done
	if ! healthy; then
		echo "   not answering after 60 s — the last lines:" >&2
		"${COMPOSE[@]}" logs --tail=40 api web >&2
		exit 1
	fi

	# Old layers fill the 50 GB disk otherwise.
	docker image prune -f >/dev/null
	"${COMPOSE[@]}" ps
	echo "Deployed $BRANCH."
}

main "$@"
exit
