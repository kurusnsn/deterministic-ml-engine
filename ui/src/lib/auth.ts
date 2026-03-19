import { getSessionId } from '@/lib/session';
import { getTraceparent } from '@/lib/tracing';

type AuthHeaderOptions = {
  includeContentType?: boolean;
  includeSessionId?: boolean;
  includeTracing?: boolean;
};

/**
 * Returns common client-side request headers.
 * Auth (Bearer token) is NOT included here — the Next.js gateway proxy
 * attaches it server-side from the NextAuth session. Client code only
 * needs session-id and content-type.
 */
export async function getClientAuthHeaders(
  { includeContentType = true, includeSessionId = true, includeTracing = true }: AuthHeaderOptions = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (includeSessionId) {
    const sessionId = getSessionId();
    if (sessionId) {
      headers['x-session-id'] = sessionId;
    }
  }

  if (includeTracing && typeof window !== 'undefined') {
    headers['traceparent'] = getTraceparent();
  }

  return headers;
}
