# Security Plan: JWT Verification Approaches

---

## Part 1 — Shared Secret (HS256)

The current implementation uses a shared HMAC secret across both auth-service and translations-service. Any service holding `JWT_SECRET` can both **sign and verify** tokens.

**Env var required on both services:**
```
JWT_SECRET=some-secret-value
```

**auth-service signs:**
```typescript
jwt.sign({ userId, email }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });
```

**translations-service verifies:**
```typescript
jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
```

### Why this is a problem

If translations-service is compromised, the attacker now holds `JWT_SECRET` and can **forge tokens** for any user — including admins. The signing secret has no business being in a service that only needs to verify.

---

## Part 2 — Asymmetric Keys (RS256) ✓ Recommended

Replace the shared secret with an RSA key pair. auth-service holds the **private key** (signs). translations-service holds only the **public key** (verifies). The public key cannot sign — leaking it gives an attacker nothing.

| | auth-service | translations-service |
|---|---|---|
| Holds | Private key | Public key only |
| Can sign tokens | Yes | No |
| Can verify tokens | Yes | Yes |
| Risk if compromised | High — rotate keys immediately | Low — attacker gains nothing |

> **OWASP JWT Security Cheat Sheet:** *"Use asymmetric algorithms (RS256, ES256) in distributed systems so that resource servers can verify tokens without possessing the signing secret."*

### Key generation (one-time setup)

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

- `jwt-private.pem` → auth-service only (`JWT_PRIVATE_KEY`)
- `jwt-public.pem` → translations-service (`JWT_PUBLIC_KEY`)
- Add both to `.gitignore` — never commit

### auth-service changes

**`src/config/env.ts`**
```typescript
export const env = {
  jwtPrivateKey: process.env.JWT_PRIVATE_KEY || '',
  jwtAlgorithm: 'RS256' as const,
};
```

**`src/utils/response.ts` — `generateToken`**
```typescript
import { SignOptions } from 'jsonwebtoken';

export function generateToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, env.jwtPrivateKey, {
    algorithm: env.jwtAlgorithm,
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });
}
```

### translations-service changes

**`src/config/env.ts`**
```typescript
export const env = {
  jwtPublicKey: process.env.JWT_PUBLIC_KEY || '',
};
```

**`src/index.ts` — verify on each request**
```typescript
jwt.verify(token, env.jwtPublicKey, { algorithms: ['RS256'] });
```

The `algorithms` whitelist is mandatory. Without it, an attacker can craft a token signed with the public key as an HMAC secret and downgrade the algorithm header to `HS256` — bypassing verification entirely. This is the **algorithm confusion attack** (OWASP).

### Key rotation

1. Generate a new key pair
2. Deploy new private key to auth-service — new tokens are signed with the new key
3. Deploy new public key to translations-service — tokens signed with the old key will fail
4. To avoid a hard cutover: temporarily accept both old and new public keys during the rotation window, then drop the old one after existing tokens expire (`JWT_EXPIRES_IN = 7d` means a 7-day window)

### Verification checklist

1. Generate key pair with `openssl`
2. Set `JWT_PRIVATE_KEY` in auth-service `.env`, `JWT_PUBLIC_KEY` in translations-service `.env`
3. `POST :3420/auth/stateless/register` → decode the JWT at jwt.io — header should show `"alg": "RS256"`
4. `POST :3000/translate` with that token → success
5. Tamper with the token signature → 401
6. Attempt HS256 algorithm confusion attack → rejected by the `algorithms` whitelist

---

## Part 3 — Enterprise: JWKS + API Gateway

The RS256 approach above requires manually copying the public key into every service's env vars. As the system grows, this becomes an operational burden. The enterprise answer is **JWKS** (JSON Web Key Sets) combined with a single verification point at the API Gateway.

### Architecture

```
Client → API Gateway (verifies JWT once) → auth-service
                                          → translations-service
                                          → any future service

Auth Service (IdP) — signs tokens, owns private key, exposes /.well-known/jwks.json
```

JWT verification happens **once at the gateway**. Downstream services sit in a private network and trust that anything reaching them is already authenticated. No service needs a public key in its config.

### JWKS endpoint

Instead of distributing a public key file, auth-service exposes a standard endpoint:

```
GET /.well-known/jwks.json
```

```json
{
  "keys": [{
    "kty": "RSA",
    "kid": "key-2026-01",
    "use": "sig",
    "n": "...",
    "e": "AQAB"
  }]
}
```

Every downstream service (or the gateway) fetches this on startup and caches it. The `kid` (key ID) is embedded in every JWT header — on receipt, the verifier looks up the matching key from the cache. No manual key distribution, no config changes on rotation.

### Zero-downtime key rotation via `kid`

1. Generate a new key pair, add it to JWKS with a new `kid` — old key stays in JWKS
2. auth-service starts signing new tokens with the new private key
3. Old tokens (carrying the old `kid`) still verify — old public key is still in JWKS
4. After `JWT_EXPIRES_IN` has elapsed, all old tokens have expired
5. Remove the old key from JWKS

No coordination needed across services. They all re-fetch JWKS automatically.

### Managed identity providers

Most companies don't build this themselves:

| Provider | Typically used by |
|---|---|
| **Keycloak** | Red Hat, large on-prem enterprises |
| **Auth0 / Okta** | Most SaaS companies |
| **AWS Cognito** | AWS shops |
| **Google IAP** | GCP shops |
| **Dex** | Kubernetes-native setups |

All of these expose JWKS out of the box, handle key rotation, and support OIDC (the standard built on top of OAuth2 + JWT).

### Relevance to this project

The RS256 plan in Part 2 is the right approach for the current two-service setup. When a third or fourth service is added, the natural next step is exposing `GET /.well-known/jwks.json` from auth-service — new services point at that URL instead of needing `JWT_PUBLIC_KEY` in their env vars. No manual key distribution at that point.
