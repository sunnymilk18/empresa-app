require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`);
    process.exit(1);
  }
  return value;
}

const config = {
  port: process.env.PORT || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  authApiUrl: required('AUTH_API_URL').replace(/\/+$/, ''),
  authApiKey: required('AUTH_API_KEY'),
  databasePath: process.env.DATABASE_PATH || './data/empresa.db',
  databaseUrl: process.env.DATABASE_URL || process.env.DATABASE_PATH || './data/empresa.db',
};

module.exports = config;
