# auth-service — Implementation Plan

## Overview

auth-service is the identity provider for the translations platform. It owns all user registration, login, and token issuance. No other service signs tokens — they only verify.

---

## Security Approach (JWT)

See [`security-approach.md`](./security-approach.md) for the full analysis. Summary:

### Current state: HS256 (shared secret)
- auth-service and translations-service both hold `JWT_SECRET`
- Any compromised service can forge tokens for any user, including admins

### Target state: RS256 (asymmetric keys) ✓
- auth-service holds the **private key** — signs tokens
- translations-service holds the **public key** — verifies only, cannot forge
- Leaking the public key gives an attacker nothing

```
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

- `jwt-private.pem` → auth-service env (`JWT_PRIVATE_KEY`)
- `jwt-public.pem` → translations-service env (`JWT_PUBLIC_KEY`)
- Both files must be in `.gitignore` — never commit

The `algorithms: ['RS256']` whitelist in `jwt.verify()` is **mandatory** to block the algorithm confusion attack (attacker crafts HS256 token signed with the public key as HMAC secret).

### Future state: JWKS endpoint
When a third service is added, expose `GET /.well-known/jwks.json` from auth-service. New services fetch the public key automatically — no manual key distribution. Supports zero-downtime rotation via `kid` headers.

---

## Implementation Phases

### Phase 1 — Foundation (done)
- [x] Koa + TypeScript project scaffold
- [x] Drizzle + PostgreSQL schema (`users` table)
- [x] Docker Compose local stack

### Phase 2 — Auth (done)
- [x] `POST /auth/register` — bcrypt password hashing, return JWT
- [x] `POST /auth/login` — verify password, return JWT
- [x] HS256 token signing (interim)

### Phase 3 — RS256 migration (next)
- [ ] Generate RSA key pair
- [ ] Update `src/config/env.ts` to read `JWT_PRIVATE_KEY`
- [ ] Update `generateToken()` to use `RS256` + private key
- [ ] Update `.env.example` with `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` vars
- [ ] Remove `JWT_SECRET` from both services
- [ ] Distribute `jwt-public.pem` to translations-service env
- [ ] Verify: decode issued token at jwt.io — header must show `"alg": "RS256"`
- [ ] Test algorithm confusion attack is rejected

### Phase 4 — JWKS endpoint (future)
- [ ] Expose `GET /.well-known/jwks.json`
- [ ] Add `kid` to issued token headers
- [ ] Update dependent services to fetch public key from URL instead of env var

---

## Environment Variables

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth
PORT=3420
NODE_ENV=development
JWT_PRIVATE_KEY=           # RS256 private key (PEM format)
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
```
