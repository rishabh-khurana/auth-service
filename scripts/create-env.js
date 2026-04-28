const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV === 'production') {
  console.log('Production mode - expecting .env to be provided');
  return;
}

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  return;
}

const template = `NODE_ENV=development
PORT=3420
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=auth
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/auth
`;

fs.writeFileSync(envPath, template);
console.log('.env created for local development');
