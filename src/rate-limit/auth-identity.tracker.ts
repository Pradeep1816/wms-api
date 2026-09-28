import { getClientIpTracker } from './client-ip.tracker';

type AuthenticationRequest = {
  body?: {
    email?: unknown;
    identity?: unknown;
  };
  ip?: string;
  ips?: string[];
  socket?: {
    remoteAddress?: string;
  };
};

const MAX_IDENTIFIER_LENGTH = 320;

/**
 * Tracks the account being protected instead of relying only on source IP.
 * Login requests from smw-web are server-proxied, so an IP-only tracker would
 * incorrectly place all website users in the same bucket.
 */
export const getAuthIdentityTracker = (
  request: AuthenticationRequest,
): string => {
  const identifier = request.body?.email ?? request.body?.identity;

  if (typeof identifier === 'string' && identifier.trim()) {
    return `identity:${identifier.trim().toLowerCase().slice(0, MAX_IDENTIFIER_LENGTH)}`;
  }

  return `ip:${getClientIpTracker(request)}`;
};
