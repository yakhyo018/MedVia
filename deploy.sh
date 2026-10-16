#!/bin/bash

# PRODUCTION
git reset --hard
git checkout main
git pull origin main

# The web image is built from the frontend repository next to this one.
git -C ../MedVia-next reset --hard
git -C ../MedVia-next checkout main
git -C ../MedVia-next pull origin main

docker compose -f deploy/docker-compose.prod.yml up -d --build
