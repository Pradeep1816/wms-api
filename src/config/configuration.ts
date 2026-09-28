export default (): any => ({
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  backendCookieValidationKey: process.env.BACKEND_COOKIE_VALIDATION_KEY,
  frontendCookieValidationKey: process.env.FRONTEND_COOKIE_VALIDATION_KEY,
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
    name: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    pass: process.env.DB_PASSWORD,
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    ttl: process.env.REDIS_CACHE_TTL ? parseInt(process.env.REDIS_CACHE_TTL, 10) : 300,
    prefix: process.env.REDIS_CACHE_PREFIX ?? 'smw-api',
  },
  smtp: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    username: process.env.MAIL_USER,
    password: process.env.MAIL_PASS,
    maxRecipientsPerMessage: parseInt(process.env.MAIL_MAX_RECIPIENTS_PER_MESSAGE ?? '45', 10),
    bulkConcurrency: parseInt(process.env.MAIL_BULK_CONCURRENCY ?? '10', 10),
    // Optional. Omit for port 587 (STARTTLS). Set to 'ssl' or use port 465 for SSL.
    encryption: process.env.MAIL_ENCRYPTION,
  },
});
