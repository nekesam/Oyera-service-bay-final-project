import 'dotenv/config';

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Add it to your .env file.`);
  }
  return value;
};

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProduction: env === 'production',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required('DATABASE'),
  sessionSecret: required('SESSION_SECRET'),
  // Set TRUST_PROXY=1 when running behind a reverse proxy (Nginx, Render, Heroku...)
  trustProxy: process.env.TRUST_PROXY || false,
};
