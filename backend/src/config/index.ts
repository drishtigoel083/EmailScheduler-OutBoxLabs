import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root or local .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function parseOptionalInt(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  postgres: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/email_scheduler?schema=public',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'email_scheduler',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  },

  scheduling: {
    // Per-sender hourly cap (primary limit). Falls back to MAX_EMAILS_PER_HOUR.
    maxEmailsPerHourPerSender:
      parseOptionalInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) ??
      parseOptionalInt(process.env.MAX_EMAILS_PER_HOUR) ??
      50,
    // Optional global cap across all senders combined (null = disabled).
    maxEmailsPerHourGlobal: parseOptionalInt(process.env.MAX_EMAILS_PER_HOUR_GLOBAL),
    minDelayMsBetweenSends: parseInt(process.env.MIN_DELAY_MS_BETWEEN_SENDS || '1000', 10),
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  },

  ethereal: {
    host: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.ETHEREAL_PORT || '587', 10),
    email: process.env.ETHEREAL_EMAIL || '',
    password: process.env.ETHEREAL_PASSWORD || '',
  },

  slack: {
    clientId: process.env.SLACK_CLIENT_ID || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET || '',
    redirectUri: process.env.SLACK_REDIRECT_URI || 'http://localhost:4000/api/slack/callback',
  },

  auth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    nextAuthSecret: process.env.NEXTAUTH_SECRET || 'dev_secret',
  },
};
