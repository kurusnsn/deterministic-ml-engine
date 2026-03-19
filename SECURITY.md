# Security

This structural snapshot contains no functional access tokens, keys, or active environment bindings. The following sections outline the security design applied in the live production branch.

## High-Level Implementation

1. **JWT Validation (High-Level)**: Identity from authentication providers (e.g. Supabase, Auth0) is verified statelessly by validating cryptographic signatures (RS256) on every mutating API request via Edge Middleware in Next.js and backend FastAPI guards.
2. **Network Segmentation**: Heavy processing nodes (LLM services) run in private subnets, never exposed to the public internet. They only accept internal RPC/HTTP traffic originating from the authorized Gateway.
3. **Container Context**: Kubernetes manifests specify `runAsNonRoot: true` dropping privileged capabilities bounding attack surfaces on container escapes.
4. **Rate Limiting**: IP-based rate limiting is enforced at the Web Application Firewall (WAF) layer to prevent volumetric abuse of the WebSockets and heavy evaluation endpoints.

> **Disclaimer**: All sensitive deployment keys, JWT secrets, and DB URLs have been removed form this codebase.
