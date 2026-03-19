/**
 * Diagnostics utilities for debugging reports/import issues in production.
 *
 * Usage in browser console:
 *   import('/lib/diagnostics').then(m => m.runDiagnostics())
 *
 * Or call from your code:
 *   import { runDiagnostics, checkAuthStatus } from '@/lib/diagnostics';
 *   const result = await runDiagnostics();
 */

import { getClientAuthHeaders } from './auth';

interface DiagnosticResult {
  timestamp: string;
  frontend: {
    has_session: boolean;
    auth_headers: Record<string, string>;
    local_storage: {
      session_id?: string;
      has_auth_token: boolean;
    };
  };
  backend?: {
    status: string;
    auth: Record<string, unknown>;
    database: Record<string, unknown>;
    services: Record<string, unknown>;
    user_data: Record<string, unknown>;
    errors: string[];
  };
  errors: string[];
}

/**
 * Check the current authentication status on the frontend
 */
export async function checkAuthStatus(): Promise<DiagnosticResult['frontend']> {
  const result: DiagnosticResult['frontend'] = {
    has_session: false,
    auth_headers: {},
    local_storage: {
      has_auth_token: false,
    },
  };

  // Check localStorage
  if (typeof window !== 'undefined') {
    result.local_storage.session_id = localStorage.getItem('session-id') || undefined;
    result.local_storage.has_auth_token = !!localStorage.getItem('auth-token');
    // Auth is managed by NextAuth server-side; session presence is inferred from cookies
    result.has_session = document.cookie.includes('next-auth.session-token') ||
      document.cookie.includes('__Secure-next-auth.session-token');
  }

  // Get auth headers
  try {
    result.auth_headers = await getClientAuthHeaders();
  } catch (e) {
    console.error('[Diagnostics] Error getting auth headers:', e);
  }

  return result;
}

/**
 * Call the backend diagnostics endpoint
 */
export async function checkBackendDiagnostics(): Promise<DiagnosticResult['backend'] | null> {
  const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

  try {
    const headers = await getClientAuthHeaders();
    const response = await fetch(`${GATEWAY_URL}/diagnostics/reports`, {
      headers,
    });

    if (!response.ok) {
      console.error('[Diagnostics] Backend diagnostic failed:', response.status, response.statusText);
      return null;
    }

    return await response.json();
  } catch (e) {
    console.error('[Diagnostics] Error calling backend diagnostics:', e);
    return null;
  }
}

/**
 * Run a test import via the backend diagnostics endpoint
 */
export async function testImportFlow(username: string = 'DrNykterstein'): Promise<unknown> {
  const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

  try {
    const headers = await getClientAuthHeaders();
    const response = await fetch(
      `${GATEWAY_URL}/diagnostics/reports/test-import?test_username=${encodeURIComponent(username)}`,
      {
        method: 'POST',
        headers,
      }
    );

    if (!response.ok) {
      console.error('[Diagnostics] Test import failed:', response.status, response.statusText);
      const text = await response.text();
      return { error: text, status: response.status };
    }

    return await response.json();
  } catch (e) {
    console.error('[Diagnostics] Error running test import:', e);
    return { error: String(e) };
  }
}

/**
 * Run full diagnostics - checks both frontend and backend
 */
export async function runDiagnostics(): Promise<DiagnosticResult> {
  console.log('[Diagnostics] Starting full diagnostics...');

  const result: DiagnosticResult = {
    timestamp: new Date().toISOString(),
    frontend: {
      has_session: false,
      auth_headers: {},
      local_storage: { has_auth_token: false },
    },
    errors: [],
  };

  // Check frontend auth
  console.log('[Diagnostics] Checking frontend auth...');
  try {
    result.frontend = await checkAuthStatus();
    console.log('[Diagnostics] Frontend auth:', result.frontend);
  } catch (e) {
    result.errors.push(`Frontend auth check failed: ${e}`);
    console.error('[Diagnostics] Frontend auth error:', e);
  }

  // Check backend diagnostics
  console.log('[Diagnostics] Checking backend diagnostics...');
  try {
    const backend = await checkBackendDiagnostics();
    if (backend) {
      result.backend = backend;
      console.log('[Diagnostics] Backend diagnostics:', backend);
    } else {
      result.errors.push('Backend diagnostics endpoint unreachable');
    }
  } catch (e) {
    result.errors.push(`Backend diagnostics failed: ${e}`);
    console.error('[Diagnostics] Backend error:', e);
  }

  // Summary
  console.log('\n[Diagnostics] === SUMMARY ===');
  console.log('Frontend session (NextAuth cookie):', result.frontend.has_session ? 'YES' : 'NO');
  console.log('Session ID present:', !!result.frontend.local_storage.session_id);

  if (result.backend) {
    console.log('Backend auth OK:', result.backend.auth);
    console.log('Database OK:', result.backend.database);
    console.log('Import service OK:', result.backend.services);
    console.log('User games:', result.backend.user_data);
    if (result.backend.errors.length > 0) {
      console.log('Backend errors:', result.backend.errors);
    }
  }

  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
  }

  console.log('\n[Diagnostics] Full result:', result);
  return result;
}

// Export to window for console access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).chessdiag = {
    runDiagnostics,
    checkAuthStatus,
    checkBackendDiagnostics,
    testImportFlow,
  };
  console.log('[Diagnostics] Available via window.chessdiag.runDiagnostics()');
}
