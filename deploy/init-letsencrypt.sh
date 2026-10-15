#!/bin/sh
# First HTTPS certificate. nginx refuses to start without the files its config names, so:
# a throw-away self-signed certificate → nginx up → the real one through the webroot → reload.
#   ./init-letsencrypt.sh you@example.com
set -e
cd "$(dirname "$0")"
EMAIL="${1:?usage: ./init-letsencrypt.sh <email for certificate notices>}"
LIVE=/etc/letsencrypt/live/medvia.tech
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "1/4 temporary certificate"
$COMPOSE create certbot >/dev/null   # creates the compose volumes (medvia_letsencrypt …)
docker run --rm -v medvia_letsencrypt:/etc/letsencrypt alpine:3.20 sh -c \
	"apk add --no-cache openssl >/dev/null && mkdir -p $LIVE && openssl req -x509 -nodes -newkey rsa:2048 -days 1 -keyout $LIVE/privkey.pem -out $LIVE/fullchain.pem -subj /CN=localhost"

echo "2/4 nginx"
$COMPOSE up -d nginx

echo "3/4 Let's Encrypt (medvia.tech, www.medvia.tech, api.medvia.tech)"
$COMPOSE run --rm --entrypoint "sh -c 'rm -rf /etc/letsencrypt/live/medvia.tech /etc/letsencrypt/archive/medvia.tech /etc/letsencrypt/renewal/medvia.tech.conf'" certbot
$COMPOSE run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot --email $EMAIL --agree-tos --no-eff-email -d medvia.tech -d www.medvia.tech -d api.medvia.tech" certbot

echo "4/4 reload"
$COMPOSE exec nginx nginx -s reload
echo "HTTPS is on."
