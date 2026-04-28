# =============================================================================
# STAGE 1: dev
# Used by docker-compose.dev.yml — source is mounted as a volume for hot-reload
# =============================================================================
FROM node:20.10.0-alpine AS dev

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .

CMD ["sh", "-c", "yarn exec drizzle-kit push:pg && yarn exec nodemon src/index.ts"]
# =============================================================================
# STAGE 2: builder
# Compiles TypeScript → dist/
# =============================================================================
FROM dev AS builder

RUN yarn build

# =============================================================================
# STAGE 3: prod
# Lean runtime image — no devDeps, no source files, only compiled dist/
# =============================================================================
FROM node:20.10.0-alpine AS prod

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
