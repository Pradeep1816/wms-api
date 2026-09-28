import { describe, expect, it } from 'vitest';
import { getClientIpTracker } from './client-ip.tracker';

describe('getClientIpTracker', () => {
  it('uses the first proxy-validated client address when available', () => {
    const tracker = getClientIpTracker({
      ips: ['203.0.113.7', '10.0.0.12'],
      ip: '10.0.0.12',
    });

    expect(tracker).toBe('203.0.113.7');
  });

  it('falls back to the direct request address', () => {
    const tracker = getClientIpTracker({
      ips: [],
      ip: '127.0.0.1',
    });

    expect(tracker).toBe('127.0.0.1');
  });
});
