#!/bin/bash

# PRODUCTION
git reset --hard
git checkout main
git pull origin main

# The app containers run the mounted folder: recreate them so they install, build and start the
# new code (a plain `up -d` leaves running containers alone). Redis keeps running.
docker compose up -d --force-recreate medvia-api medvia-batch
