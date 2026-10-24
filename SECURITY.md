# Security policy

Farmers is a prototype with a shared Node.js/SQLite backend and a separate fictional browser demo. The local rules preview uses no real authentication or AI. The shared fictional presentation uses passcode-protected server sessions and actual hosted Gemma. Demo identities are intentionally shared by presenters and must contain invented information. Demo members cannot match live accounts or publish to their event cohort. Only the deployment operator can reset shared introductions. The deployed shared service also offers operator password access; university email codes require separately configured SMTP and approved exact domains.

## Campus disclosure boundary

The backend returns private profile fields only to their owner. Anonymous suggestions omit the other person's identity and stable account ID. Two independent yeses permit name, course, year, and email disclosure. Refusals close silently. Consent withdrawal stops future disclosure but cannot retract information already seen.

Campus members and their social records are excluded from legacy archive responses, including administrator projections and exports. Legacy commands reject campus actors and targets. Staff cannot read private ideas through campus endpoints. The database operator can access server storage; the prototype does not provide end-to-end encryption.

Pair scoring sends only controlled categories to hosted Gemma through Backboard. Private idea text is stored for the owner and not sent for matching. Separately consented interest text is pattern-scrubbed, not guaranteed anonymous. Staff-selected poster images are sent to the hosted provider. Backboard memory is disabled and returned task conversations are deleted after use, without a claim of zero provider retention.

## Credentials and operations

- Store Backboard, SMTP, OTP, and bootstrap secrets only in private server configuration. Never expose them through frontend environment variables, logs, source, or API responses.
- Passwords use salted scrypt hashes. Bearer tokens are random; SQLite stores their hashes. The browser keeps the raw token in tab-scoped sessionStorage. Protect against script injection.
- OTPs are six-digit random values, HMAC-hashed, limited to five verification attempts, valid for ten minutes, and consumed once. The mocked directory does not verify university affiliation.
- Keep HTTPS enabled for both public origins. The API listener remains private behind Caddy. CORS is restricted to the frontend origin and does not replace authentication.
- Keep one API instance per SQLite database. Back up with SQLite's online backup utility and test restores.
- Matching and paid AI tasks have persistent limits. Provider failures never generate fabricated AI results.

## Report a vulnerability

Use GitHub's private vulnerability reporting or contact a maintainer privately through GitHub. Do not post exploitable details, credentials, member information, or database contents in a public issue.

Include the affected commit, impact, and safe reproduction steps. Do not test another deployment without its operator's permission.

The project has no formal security review, email recovery service, or compliance certification. Its demo fixtures are fictional; production identity, data retention, support, and safeguarding require a separate operational review.
