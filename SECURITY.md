# Security policy

Farmers has a browser-only demo and an optional shared Node.js API. Demo profiles and profile switching are fictional simulations, not authentication. API mode uses scrypt password hashes and hashed bearer tokens, with the bearer token stored in `sessionStorage` for the current browser tab. It does not use cookie sessions.

The API prototype does not have a verified email transport or recovery flow. Email addresses are not proven to belong to their registrants. Adult status is an attestation, not an age check. New accounts remain pending until an administrator approves them, except the bootstrap administrator created from private server configuration. Operators must not interpret these controls as identity verification or safeguarding.

Do not use the demo mode to store real personal information. Before inviting real members to API mode, review the implementation and deployment yourself, require HTTPS, restrict the API to expected frontend origins, protect and back up the SQLite file, and establish support, moderation, account recovery, retention, and incident response processes. Do not deploy this prototype for minors.

## Report a vulnerability

Please use GitHub’s **Report a vulnerability** action in the repository Security tab (private vulnerability reporting), or contact a repository maintainer privately through GitHub if that option is unavailable. Do not open a public issue for an exploitable vulnerability or include personal information, tokens, passwords, or production database contents in a public report.

Include the affected version or commit, impact, reproduction steps, and safe proof of concept. Give maintainers reasonable time to investigate before public disclosure. Do not test against a third-party deployment without the operator’s permission.

## Deployment security notes

- Use HTTPS for the frontend and API. Bearer tokens are accessible to JavaScript in the current tab; a cross-site scripting flaw could expose them.
- Keep the API listener private behind the HTTPS reverse proxy. Set `CORS_ORIGIN` to the exact frontend origin; CORS is not authentication.
- Set an operator-controlled `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters. Startup creates this administrator before accepting public registration. Public registration always creates pending members.
- Keep `SQLITE_PATH` on persistent protected storage. Back up using SQLite’s online backup API and test restoration. Droplet disk and backups need access controls and encryption at rest appropriate to the operator.
- `USE_DEMO_DATA=false` is required for a shared deployment unless the operator intentionally wants the fictional sample seed. Never mistake the seed for verified venue information.
- Do not run multiple API replicas against the same SQLite file or put the database on an ephemeral filesystem.

The project does not provide an email delivery service, formal security review, response-time guarantee, or compliance certification.
