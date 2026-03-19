# Dev Gateway Proxy Fix (2026-02-13)

## Problem

All API calls from the UI returned **500 Internal Server Error** in the Kubernetes dev environment (`localhost:3100`). Nothing on the site worked - no fetching, generating, or saving data.

## Root Cause

The Next.js UI proxy route (`ui/src/app/api/gateway/[...path]/route.ts`) had `GATEWAY_INTERNAL_URL` read as a **module-level constant**:

```ts
// BAD - gets inlined by Next.js at build time
const GATEWAY_INTERNAL_URL = process.env.GATEWAY_INTERNAL_URL || "http://localhost:8010";
```

The Dockerfile (`ui/Dockerfile`) set `GATEWAY_INTERNAL_URL=http://prod-gateway-service:8000` as both an `ARG` and `ENV` during `next build`. Next.js statically replaces `process.env.GATEWAY_INTERNAL_URL` with the literal string at build time. The runtime configmap value (`http://dev-gateway-service:8000`) was **completely ignored**.

Result: every proxied request tried to connect to `prod-gateway-service:8000`, which doesn't exist in the `ostadchess-dev` namespace. The DNS lookup failed and the proxy returned 500.

## Fixes

### 1. Prevent build-time inlining in the proxy route

**File:** `ui/src/app/api/gateway/[...path]/route.ts`

Use bracket notation (`process.env[envKey]`) inside a function to prevent Next.js from statically replacing the value:

```ts
// GOOD - evaluated at runtime, not inlined at build time
function getGatewayUrl(): string {
  const envKey = "GATEWAY_INTERNAL_URL";
  return (process.env[envKey] || "http://localhost:8010").replace(/\/$/, "");
}
```

Also added try/catch around the fetch to return a proper 502 instead of a bare 500 when the gateway is unreachable.

The same fix was applied to `ui/src/app/auth/callback/route.ts`.

### 2. Safe Dockerfile default

**File:** `ui/Dockerfile`

Changed the default `GATEWAY_INTERNAL_URL` ARG from `http://prod-gateway-service:8000` to `http://localhost:8010`. Even if inlining occurs, it falls back to a safe localhost default rather than a namespace-specific service name.

### 3. Mock auth bypass for Stripe endpoints

**File:** `gateway-service/gateway_modules/routers/subscriptions.py`

- `create-checkout` and `create-portal` now short-circuit with mock responses when `MOCK_AUTH_ENABLED=true`, instead of trying to call Stripe (which 500s without valid keys).
- `get_owner_from_request_local()` now returns the mock user unconditionally when mock auth is on, matching the behavior of `get_owner_from_request()` in `app.py`.

### 4. K8s dev UI mock auth env vars

**File:** `k8s/overlays/dev/kustomization.yaml`

Added `NEXT_PUBLIC_MOCK_AUTH_ENABLED=true` and related mock env vars to the `ui-config` configmap. Without these, the frontend never sends auth tokens or session IDs.

> **Note:** `NEXT_PUBLIC_*` vars are inlined at build time by Next.js. For these to take effect in k8s, they must be set as build args during `docker build`, or the UI code must use a runtime-safe pattern (like the bracket notation above).

### 5. Docker Compose improvements

**File:** `docker-compose.yml`

- Added `FRONTEND_URL=http://localhost:3000` to the gateway (prevents 500 on Stripe endpoints when mock auth is off).
- Made the puzzle service depend on gateway to ensure migration 026 runs first (puzzle queries need `puzzle_rating` column).

## Rules to Prevent Recurrence

1. **Never use `process.env.SOMETHING` at module level in Next.js server routes** if the value must differ between environments. Use `process.env[key]` inside a function instead.

2. **Never hardcode k8s service names in the Dockerfile.** Use a neutral default like `localhost`. The actual service URL comes from the configmap at runtime.

3. **When adding `MOCK_AUTH_ENABLED` bypass to the gateway, add it to ALL endpoints** that would otherwise hit external services (Stripe, Supabase, etc.).

4. **The CI pipeline** (`build-ui` job in `.gitlab-ci.yml`) passes `GATEWAY_INTERNAL_URL` as a build arg. If you change the default in the Dockerfile, also check the CI job (line 265 of `.gitlab-ci.yml`).
