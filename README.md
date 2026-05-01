# Auth Service

A dual-mode authentication service demonstrating both stateless (JWT) and stateful (session-based) authentication patterns.

## Stateless Authentication (JWT)

The server signs a token and forgets about it. No session state is stored server-side.

### Registration

```
┌─────────┐         POST /auth/stateless/register    ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
└─────────┘           { email, password }            └────┬─────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │ 1. Validate  │
                                                  │  credentials │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 2. Hash      │
                                                  │  password    │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 3. Create    │
                                                  │  user in DB  │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 4. Generate  │
                                                  │  JWT token   │
                                                  └──────┬───────┘
                                                         │
                              ┌──────────────────────────┘
                              │
                              ▼
┌─────────┐         200 OK + { token, user }       ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
└─────────┘                                        └──────────┘
```

### Login

```
┌─────────┐         POST /auth/stateless/login     ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
└─────────┘           { email, password }            └────┬─────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │ 1. Validate  │
                                                  │  credentials │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 2. Find user │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 3. Verify    │
                                                  │  password    │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 4. Generate  │
                                                  │  JWT token   │
                                                  └──────┬───────┘
                                                         │
                              ┌──────────────────────────┘
                              │
                              ▼
┌─────────┐         200 OK + { token, user }       ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
└─────────┘                                        └──────────┘
```

### API Access

```
┌─────────┐         GET /api/protected             ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
│         │    Authorization: Bearer <jwt_token>     │          │
└─────────┘                                        └────┬─────┘
                                                        │
                                                        ▼
                                                ┌──────────────┐
                                                │ 1. Verify    │
                                                │  JWT signature│
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 2. Decode    │
                                                │  payload     │
                                                └──────┬───────┘
                                                       │
                              ┌────────────────────────┘
                              │
                              ▼
┌─────────┐              200 OK + data             ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
└─────────┘        [No DB lookup needed]           └──────────┘
```

### Logout (Client-Side Only)

```
┌─────────┐                                          ┌──────────┐
│ Client  │         1. Delete token from             │          │
│         │            localStorage/cookies          │  Server  │
│         │                                          │          │
│         │         2. No request sent to server     │   [NO    │
│         │                                          │  ACTION] │
│         │         3. Token valid until expiry      │          │
│         │            (cannot be revoked)           │          │
└─────────┘                                          └──────────┘
```

---

## Stateful Authentication (JWT + Refresh Tokens)

Server stores **refresh tokens** in database. Client holds both a short-lived JWT access token and a long-lived opaque refresh token in HttpOnly cookies. This provides stateless API access with stateful session control.

### Registration

```
┌─────────┐         POST /auth/stateful/register   ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
└─────────┘           { email, password }            └────┬─────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │ 1. Validate  │
                                                  │  credentials │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 2. Hash      │
                                                  │  password    │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 3. Create    │
                                                  │  user in DB  │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 4. Generate  │
                                                  │  JWT access  │
                                                  │  token (1hr) │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 5. Generate  │
                                                  │  opaque      │
                                                  │  refresh     │
                                                  │  token (1d)  │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 6. Store     │
                                                  │  refresh     │
                                                  │  token in DB │
                                                  └──────┬───────┘
                                                         │
                              ┌──────────────────────────┘
                              │
                              │ Set-Cookie: accessToken=xxx
                              │ Set-Cookie: refreshToken=yyy
                              │ (HttpOnly, Secure, SameSite)
                              ▼
┌─────────┐         200 OK + { user }              ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
│ (browser │                                        └──────────┘
│  stores  │
│  cookies)│
└─────────┘
```

### Login

```
┌─────────┐         POST /auth/stateful/login      ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
└─────────┘           { email, password }            └────┬─────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │ 1. Validate  │
                                                  │  credentials │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 2. Find user │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 3. Verify    │
                                                  │  password    │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 4. Generate  │
                                                  │  JWT access  │
                                                  │  token (1hr) │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 5. Generate  │
                                                  │  opaque      │
                                                  │  refresh     │
                                                  │  token (1d)  │
                                                  └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ 6. Store     │
                                                  │  refresh     │
                                                  │  token in DB │
                                                  └──────┬───────┘
                                                         │
                              ┌──────────────────────────┘
                              │
                              │ Set-Cookie: accessToken=xxx
                              │ Set-Cookie: refreshToken=yyy
                              ▼
┌─────────┐         200 OK + { user }              ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
│ (browser │                                        └──────────┘
│  stores  │
│  cookies)│
└─────────┘
```

### Token Refresh (Single-Use Rotation)

```
┌─────────┐         POST /auth/stateful/refresh    ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
│         │         Cookie: refreshToken=xxx         │          │
│ (browser │         (auto-sent)                    └────┬─────┘
│  has     │                                             │
│  cookie) │                                             ▼
└─────────┘                                     ┌──────────────┐
                                                │ 1. Extract   │
                                                │  refresh     │
                                                │  token       │
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 2. Look up   │
                                                │  token in    │
                                                │  database    │
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 3. Verify    │
                                                │  not expired │
                                                │  or revoked  │
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 4. Delete    │
                                                │  old token   │
                                                │  (single-use)│
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 5. Generate  │
                                                │  new access  │
                                                │  & refresh   │
                                                │  tokens      │
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 6. Store new │
                                                │  refresh     │
                                                │  token in DB │
                                                └──────┬───────┘
                                                       │
                              ┌────────────────────────┘
                              │
                              │ Set-Cookie: accessToken=xxx
                              │ Set-Cookie: refreshToken=yyy
                              ▼
┌─────────┐         200 OK + { user }              ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
└─────────┘                                        └──────────┘
```

### API Access

```
┌─────────┐         GET /api/protected             ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
│         │         Cookie: accessToken=xxx          │          │
│ (browser │         (auto-sent)                    │          │
│  has     │                                        │          │
│  cookie) │                                        └────┬─────┘
└─────────┘                                             │
                                                        ▼
                                                ┌──────────────┐
                                                │ 1. Verify    │
                                                │  JWT         │
                                                │  signature   │
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 2. Decode    │
                                                │  payload     │
                                                └──────┬───────┘
                                                       │
                              ┌────────────────────────┘
                              │
                              ▼
┌─────────┐              200 OK + data             ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
└─────────┘        [No DB lookup needed]           └──────────┘
```

### Logout (Server-Side)

```
┌─────────┐         POST /auth/stateful/logout     ┌──────────┐
│ Client  │ ───────────────────────────────────────▶ │  Server  │
│         │         Cookie: refreshToken=xxx         │          │
│ (browser │         (auto-sent)                    └────┬─────┘
│  has     │                                             │
│  cookie) │                                             ▼
└─────────┘                                     ┌──────────────┐
                                                │ 1. Extract   │
                                                │  refresh     │
                                                │  token       │
                                                └──────┬───────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 2. Delete    │
                                                │  refresh     │
                                                │  token from  │
                                                │  database    │
                                                └──────┬───────┘
                                                       │
                              ┌────────────────────────┘
                              │
                              │ Set-Cookie: accessToken=
                              │ Set-Cookie: refreshToken=
                              │ Max-Age=0 (clear cookies)
                              ▼
┌─────────┐         200 OK + { message }           ┌──────────┐
│ Client  │ ◀──────────────────────────────────────│  Server  │
│ (cookies │                                        └──────────┘
│ cleared) │
└─────────┘
```

---

## Comparison

| Feature | Stateless (JWT) | Stateful (Refresh Tokens) |
|---------|----------------|---------------------------|
| Access Token Storage | Client-side (localStorage/cookies) | HttpOnly cookies |
| Refresh Token Storage | N/A | Server-side (database) |
| Server Memory | None | Refresh token records |
| API Request DB Lookup | None | None (JWT validated) |
| Logout | Client-side only | Server-side revocation |
| Token Refresh | Manual re-login | Automatic with rotation |
| Token Theft Recovery | Wait for expiry | Immediate revocation |
| Horizontal Scaling | Easy (no shared state) | Requires shared DB for refresh tokens |
| Best For | Microservices, mobile APIs | Web apps requiring session control |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/stateless/register` | Register user, return JWT |
| POST | `/auth/stateless/login` | Login user, return JWT |
| POST | `/auth/stateful/register` | Register user, set HttpOnly cookies |
| POST | `/auth/stateful/login` | Login user, set HttpOnly cookies |
| POST | `/auth/stateful/refresh` | Rotate refresh token, set new cookies |
| POST | `/auth/stateful/logout` | Delete refresh token, clear cookies |

### Token Details

| Token | Type | Storage | Expiry | Purpose |
|-------|------|---------|--------|---------|
| Access Token | JWT | HttpOnly Cookie | 1 hour | Authenticate API requests |
| Refresh Token | Opaque (random hex) | HttpOnly Cookie + Database | 1 day | Obtain new access token |

**Security Features:**
- **HttpOnly cookies**: Prevent XSS attacks from accessing tokens
- **Single-use refresh tokens**: Old refresh token deleted on use (rotation)
- **Token revocation**: Refresh tokens can be invalidated on logout

## Quick Start

```bash
# Install dependencies
yarn install

# Start PostgreSQL
docker-compose -f docker-compose.dev.yml up postgres

# Run migrations
yarn db:push

# Start development server
yarn dev
```

Server runs at http://localhost:3420
