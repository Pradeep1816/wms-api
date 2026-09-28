import { describe, expect, it } from 'vitest';
import { getAuthIdentityTracker } from './auth-identity.tracker';

describe('getAuthIdentityTracker', () => {
  it('normalizes an email account into one rate-limit identity', () => {
    const tracker = getAuthIdentityTracker({
      body: {
        email: '  Admin@Example.COM ',
      },
      ip: '127.0.0.1',
    });

    expect(tracker).toBe('identity:admin@example.com');
  });

  it('supports the user login identity field', () => {
    const tracker = getAuthIdentityTracker({
      body: {
        identity: 'Customer-123',
      },
      ip: '127.0.0.1',
    });

    expect(tracker).toBe('identity:customer-123');
  });

  it('uses the trusted client address when no identifier was parsed', () => {
    const tracker = getAuthIdentityTracker({
      body: {},
      ips: ['203.0.113.7'],
      ip: '10.0.0.12',
    });

    expect(tracker).toBe('ip:203.0.113.7');
  });
});
