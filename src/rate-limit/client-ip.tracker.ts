type ProxyAwareRequest = {
  ip?: string;
  ips?: string[];
  socket?: {
    remoteAddress?: string;
  };
};

/**
 * Uses Express's proxy-aware addresses. `req.ips` is only populated from
 * X-Forwarded-For after the direct proxy has been marked as trusted.
 */
export const getClientIpTracker = (request: ProxyAwareRequest): string => {
  return (
    request.ips?.[0] ?? request.ip ?? request.socket?.remoteAddress ?? 'unknown'
  );
};
