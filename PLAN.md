# auth-service — Learning Project Plan

## Overview

A hands-on project for learning how authentication systems work. The goal is to implement the three core auth operations — **register**, **login**, and **logout** — in two ways:

1. **Stateless authentication** — JWT-based. The server issues a signed token; no server-side session state is stored.
2. **Stateful authentication** — Session-based. The server stores session state (in the database or a cache like Redis), and the client holds only a session ID in a cookie.

Comparing both approaches side by side makes the trade-offs concrete: token portability vs. instant revocation, horizontal scaling vs. session storage overhead, etc.

---

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Koa
- **ORM:** Drizzle + PostgreSQL
- **Password hashing:** bcrypt
- **Stateless tokens:** jsonwebtoken (HS256 → RS256)
- **Stateful sessions:** DB-backed sessions (later: Redis)

---

## Part 1 — Stateless Authentication (JWT)

Auth operations are proven stateless: the server signs a token and forgets about it. Verification happens by checking the signature — no DB lookup required.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/stateless/register` | Hash password, persist user, return signed JWT |
| POST | `/auth/stateless/login` | Verify password, return signed JWT |
| POST | `/auth/stateless/logout` | N/A — client-side only; client deletes token from cookies/storage |

### Current state

- [x] `POST /auth/stateless/register` — bcrypt hashing, user persisted, JWT returned
- [x] `POST /auth/stateless/login` — password verified, JWT returned
- [x] HS256 signing with `JWT_SECRET`
- [x] ~~`POST /auth/stateless/logout`~~ — **Not implemented (by design)**. Stateless JWT logout is client-side only — the server has no session to invalidate. Client simply deletes the token from cookies/storage.

### Advanced stateless auth (beyond this project's scope)

> These concepts are specific to JWT/stateless auth — they do **not** apply to stateful/session-based auth, which has an entirely different security surface (see Part 2).

The current implementation uses HS256 (shared secret). For production/multi-service use cases, the next steps are RS256 (asymmetric keys) and eventually a JWKS endpoint for zero-downtime key rotation. These are documented in detail in [`plans/security-approach.md`](./plans/security-approach.md), which covers:

- **HS256 → RS256 migration** — replace the shared secret with an RSA key pair so downstream services can verify tokens without being able to forge them
- **Algorithm confusion attack** — why the `algorithms` whitelist in `jwt.verify()` is mandatory
- **JWKS endpoint** — expose `GET /.well-known/jwks.json` for automatic key distribution across many services
- **Zero-downtime key rotation** via `kid` headers
- **Managed identity providers** (Auth0, Keycloak, Cognito, etc.) — the enterprise answer

### Key concept: why logout is a problem for stateless auth

A JWT is valid until it expires — the server has no blacklist. "Logout" in a stateless system means the **client** deletes the token. If a token is stolen before expiry, there is no way to revoke it without adding server-side state (which breaks the stateless property). Short expiry times + refresh-token rotation are the common mitigation.

#### Why a server-side logout route is pointless for stateless auth

Since the server is truly stateless, it doesn't track issued tokens. A `POST /auth/stateless/logout` endpoint would have nothing to do — there's no session database entry to delete, no server-side state to invalidate. The token remains valid until expiry regardless of what the server does. The only meaningful "logout" action is for the **client** to remove the token from cookies or localStorage. Any server-side "logout" route would just return a 200 OK without actually invalidating anything, creating a false sense of security. This is not an implementation omission — it's a fundamental characteristic of stateless authentication.

---

## Part 2 — Stateful Authentication (Sessions)

Auth operations use server-stored sessions. The client holds a session ID (in an `HttpOnly` cookie); the server looks it up on every request.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/stateful/register` | Hash password, persist user, create session, set cookie |
| POST | `/auth/stateful/login` | Verify password, create session, set cookie |
| POST | `/auth/stateful/logout` | Delete session from DB, clear cookie |

### Implementation steps

- [x] `POST /auth/stateful/register` — implemented with session creation and HttpOnly cookie
- [ ] `POST /auth/stateful/login` — route created (placeholder response)
- [x] `POST /auth/stateful/logout` — implemented with session deletion and cookie clearing
- [x] Add `user_sessions` table to Drizzle schema
- [x] Run database migration to create `user_sessions` table
- [ ] Implement `POST /auth/stateful/register` — register user, create session row, set `Set-Cookie: sessionId=...; HttpOnly`
- [ ] Implement `POST /auth/stateful/login` — verify password, create session row, set cookie
- [ ] Implement `POST /auth/stateful/logout` — delete session row, clear cookie (`Set-Cookie: sessionId=; Max-Age=0`)
- [ ] Session middleware — on authenticated routes, read cookie → look up session → attach user to context

### Security concerns (stateful-specific)

These are distinct from JWT security — no cryptography involved, but cookies introduce a different attack surface:

- **Session fixation** — regenerate the session ID after login so a pre-login ID can't be reused by an attacker
- **Session hijacking** — set `HttpOnly` (no JS access), `Secure` (HTTPS only), and `SameSite=Strict` flags on the cookie
- **Session expiry** — enforce `expiresAt` on the server side; clean up expired rows periodically
- **CSRF** — cookies are sent automatically by the browser on every request, making them vulnerable to cross-site request forgery; bearer tokens in `Authorization` headers are not. Mitigation: double-submit cookie or synchronizer token pattern.

### Key concept: why logout is easy for stateful auth

Logout simply deletes the session row. Even if an attacker copied the session cookie, it immediately becomes invalid. This is the main advantage over stateless JWTs.

---

## Environment Variables

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth
PORT=3420
NODE_ENV=development

# Stateless auth
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d

# Shared
BCRYPT_ROUNDS=10
```

---

## Learning Goals Checklist

- [ ] Understand the request/response cycle for each auth operation
- [ ] Understand what makes JWT "stateless" and what trade-offs that creates
- [ ] Understand how session cookies work and why `HttpOnly` matters
- [ ] Understand why logout is trivial in stateful auth but hard in stateless auth
- [ ] Be able to explain when you'd choose one approach over the other
