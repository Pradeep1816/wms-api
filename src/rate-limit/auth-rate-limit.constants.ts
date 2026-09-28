export const LOGIN_THROTTLER = 'login';
export const PASSWORD_RESET_THROTTLER = 'passwordReset';

export const AUTH_RATE_LIMITS = {
  login: {
    limit: 5,
    ttl: 60_000,
  },
  passwordReset: {
    limit: 3,
    ttl: 15 * 60_000,
  },
} as const;
