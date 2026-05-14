import crypto from "node:crypto";

const samplePublicKeyPem = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv39b8Cq+7l39C5g/C2tS
k0Z3R/3N8pGjG7z4A9yQWq6d7t0B2M6x5fW2xMv4Rk6X4q9Y7gZ7v3k0o1j4m8vG
3x2fG+R4V4S4S6K1D3Z3X7eY4qGv6x3S4b8q2pM3gK3M6z1e1+w8Y7jG5w6p2X4O
8B4qMvO3k7vN6E3y+V4a5S7wN6T7C5N3v8b8q2nO3E4F4D3D3o2k2j8d7E4s8W7d
1S4S+C5v2v7z1g5N8j7eM4E7S4f5S3vN3t5z2B5e6Q4Y7D2Y3F7v8n2x7z4Y7o2r
3y6M3V2d7x7V5M2C7x6y5d7R8t2V7M2R3f5S7n8o2X7V4P3e5M2C7D2A3F7w3q2L
6wIDAQAB
-----END PUBLIC KEY-----`;

export const getPublicKey = () => {
  // the secret value is retrieved from KMS
  const publicKeyObject = crypto.createPublicKey({
    key: samplePublicKeyPem,
    format: "pem",
    type: "spki",
  });

  const jwk = publicKeyObject.export({ format: "jwk" });

  return { kty: jwk.kty, n: jwk.n, e: jwk.e };
};
