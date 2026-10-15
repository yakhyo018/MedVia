# The API and the batch share one image (two entry points). Stages:
#   build    — every dependency + the sources: compiles, and runs the one-off scripts
#              (seed:demo, seed:admin, photos:attach) through ts-node — compose's `tools` service.
#   runtime  — production dependencies + dist only.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p uploads && chown -R node:node /app
# The scripts run as `node` too, so the files they put in the uploads volume stay writable for the API.
USER node

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Uploaded images live in a named volume mounted here; the folder must belong to `node`.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3000 3001
CMD ["node", "dist/apps/medvia-api/main"]
