#!/bin/sh
# The certbot service renews in the background; nginx reads the new files on reload.
# crontab -e:  0 4 * * * /opt/medvia/MedVia/deploy/renew.sh >/dev/null 2>&1
cd "$(dirname "$0")" && docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload
