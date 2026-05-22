<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# EventScorer LAN-Only Development Rules

EventScorer is strictly for local network use. Future development must keep it LAN-only and never assume cloud or public internet exposure.

## Non-Negotiable Rules

1. No public internet exposure
   - Never add features that require public IPs, port forwarding, reverse tunnels, or cloud hosting.
   - Internet connectivity may exist, but the system must not depend on it.
   - Do not require public DNS, public certificates, or internet-reachable endpoints.

2. No cloud dependencies
   - Do not introduce cloud storage, hosted databases, SaaS auth, or third-party APIs that require internet access.
   - Offline-first LAN behavior must remain functional with internet connected or disconnected.

3. Local network trust boundaries
   - Assume the app runs on a trusted LAN only.
   - If new sensitive actions are added, prefer optional local-only auth (PIN/shared secret) rather than cloud identity.

4. Network topology constraints
   - UI and API must stay on local ports and be reachable only within the LAN subnet.
   - Bind to local device IPs or 0.0.0.0 for LAN access when needed.
   - Any proxying must target local origins (127.0.0.1, 0.0.0.0, or LAN IP) only.

5. Logging and telemetry
   - No external telemetry, analytics, or remote logging.
   - Logs stay local on disk or in-memory only.

6. Secrets and configuration
   - Store secrets locally only.
   - Use .env on the server PC (Win11 local network server) as the single source of secrets.

## Engineering Practices for LAN-Only

- Prefer local hostnames and LAN IPs in generated links.
- Treat "x-forwarded-" headers only for local reverse proxies.
- Keep WebSocket origins local; never add cross-internet fallbacks.
- Avoid auto-update mechanisms that fetch binaries from the internet.

## Review Checklist for New Features

- Does this work with the internet connected or completely disconnected?
- Does it avoid any dependency on cloud services or public internet endpoints?
- Are new links or callbacks strictly local (LAN IP, 127.0.0.1, or 0.0.0.0)?
- Are any new secrets stored locally in server .env (no remote identity requirements)?
