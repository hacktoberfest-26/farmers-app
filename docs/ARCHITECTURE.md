# Architecture

Farmers serves a static Next.js PWA from GitHub Pages and a Node.js API from a DigitalOcean Droplet. Both use the same Zod schemas and pure domain rules. The backend uses SQLite; PostgreSQL and Supabase are not dependencies.

## Data flow

The interface calls `client.snapshot()` and `client.execute(command)`. `NEXT_PUBLIC_API_URL` chooses the data transport once at build time. In shared mode, those operations call `GET /api/community` and `POST /api/commands` with a bearer session. In local demo mode, sql.js runs SQLite WebAssembly in the browser and persists the database in IndexedDB. Demo changes stay in that browser.

- `src/lib/model.ts`: boundary schemas, domain types and deployment configuration.
- `src/lib/policy.ts`: matching, eligibility and command transitions.
- `src/lib/client.ts`: HTTP/auth and browser persistence; transport types do not leak into screens.
- `src/lib/sqlite.ts`: browser SQLite schema, transactional writes and binary export.
- `src/lib/seed.ts`: fictional people, sessions, nine bilingual guides and explicitly unverified venues.
- `server/src/app.ts`: Fastify HTTP/auth boundary, exact-origin CORS, rate limits and security headers.
- `server/src/store.ts`: SQLite transactions, password credentials, hashed session tokens and user preferences.
- `server/src/project.ts`: the sole projection of stored data into an authorized response.
- `src/components/`: responsive feed, discovery, social, session, onboarding and administration UI.
- `src/messages/`: English and Italian next-intl dictionaries.
- `public/`: scoped service worker, install manifest, original sprout mark and SQLite runtime.

## Persistence and authority

The server stores a validated community snapshot as JSON in one SQLite row, with separate relational tables for credential records, hashed session tokens and per-user preferences. This intentionally small prototype design favors a single writer and straightforward transactions. Commands run inside `BEGIN IMMEDIATE`; authoritative state is read again inside that transaction, so simultaneous joins cannot overfill a session. It is a single-community deployment. Independent communities run separate instances and SQLite files.

The server derives the actor from a random bearer token, never a submitted profile ID. Passwords are salted scrypt hashes. Raw session tokens are returned once, hashed in SQLite, and held in the frontend tab’s sessionStorage. Public registration always starts pending; operator-controlled startup credentials create the first administrator. No default password or public email-based promotion exists.

Public responses contain guides, venues, settings and announcements. Private profiles require approved adult membership and completed onboarding. Accepted connections can see each other when hidden from discovery. Blocks apply both ways. Messaging requires an accepted connection. Applicant, invitee and waitlist IDs are restricted to the organizer, administrator and the relevant individual. Admins can review pending profiles. Saved sessions, likes and notifications have separate ownership in the server store.

A confirmed group does not imply an external venue booking. Session instants are UTC; forms and displays use the configured IANA timezone. Nonexistent daylight-saving wall times are rejected. Matching unions overlapping weekly availability slots before scoring. Different timezones are not asserted to overlap without conversion.

## Prototype limits

The API returns a full permitted snapshot and the browser polls every 15 seconds. This fits a small prototype, not a large installation; pagination and delta updates should precede scaling. SQLite JSON snapshots are not a normalized production schema. Email ownership verification, recovery mail, push notifications, calendar integration and multi-tenant hosting are not implemented. Adult eligibility is an attestation. Venue information is fictional or unverified.

The PWA caches its public shell and static resources. API responses are not service-worker cached. Commands fail explicitly offline. Demo profile switching is a simulation and does not provide account security.

## Design decision

Two independent architecture candidates compared server-centric and client-first designs. An independent judge selected the client-first boundary for GitHub Pages compatibility. The user then selected a separate Node.js/SQLite backend on DigitalOcean. That requirement replaces the original suggested Supabase stack. Transactional capacity, private response projections, protected roles and mutual-connection messaging remain enforced on the server. Existing repository MIT licensing is preserved.
