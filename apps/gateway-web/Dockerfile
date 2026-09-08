# Build stage: reproducible install from the lockfile, full dev toolchain for `next build`.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# `public/` is empty in git; make sure it exists so the runtime COPY below never fails.
RUN mkdir -p public && npm run build && npm prune --omit=dev

# Runtime stage: production deps only, non-root user.
FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.js ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
