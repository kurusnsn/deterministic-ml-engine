/**
 * W3C Trace Context utilities for distributed tracing.
 * Generates traceparent headers to propagate trace context from frontend to backend.
 */

/**
 * Generate a random hex string of specified length.
 */
function generateHexId(length: number): string {
  const bytes = new Uint8Array(length / 2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate W3C traceparent header value for outgoing requests.
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 *
 * @see https://www.w3.org/TR/trace-context/#traceparent-header
 */
export function generateTraceparent(): string {
  const version = "00";
  const traceId = generateHexId(32); // 16 bytes = 32 hex chars
  const parentId = generateHexId(16); // 8 bytes = 16 hex chars
  const traceFlags = "01"; // sampled

  return `${version}-${traceId}-${parentId}-${traceFlags}`;
}

/**
 * Parse a traceparent header and extract its components.
 */
export function parseTraceparent(traceparent: string): {
  version: string;
  traceId: string;
  parentId: string;
  traceFlags: string;
} | null {
  const parts = traceparent.split("-");
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, parentId, traceFlags] = parts;

  // Validate format
  if (
    version.length !== 2 ||
    traceId.length !== 32 ||
    parentId.length !== 16 ||
    traceFlags.length !== 2
  ) {
    return null;
  }

  return { version, traceId, parentId, traceFlags };
}

/**
 * Get traceparent header value.
 * Currently generates a new trace for each request.
 * In the future, this could be extended to use OpenTelemetry SDK
 * to get the current span context if available.
 */
export function getTraceparent(): string {
  return generateTraceparent();
}

/**
 * Extract trace context from incoming headers (useful for SSR).
 */
export function extractTraceContext(
  headers: Record<string, string | undefined>
): {
  traceId: string | null;
  parentId: string | null;
} {
  const traceparent = headers["traceparent"];

  if (!traceparent) {
    return { traceId: null, parentId: null };
  }

  const parsed = parseTraceparent(traceparent);
  if (!parsed) {
    return { traceId: null, parentId: null };
  }

  return {
    traceId: parsed.traceId,
    parentId: parsed.parentId,
  };
}
