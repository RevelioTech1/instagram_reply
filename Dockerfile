FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=4317
ENV NODE_OPTIONS="--experimental-sqlite --disable-warning=ExperimentalWarning"
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node data/catalog.json ./seed/catalog.json
COPY --chmod=755 deploy/entrypoint.sh /usr/local/bin/insta-entrypoint
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4317
ENTRYPOINT ["insta-entrypoint"]
CMD ["node", "server.js"]
