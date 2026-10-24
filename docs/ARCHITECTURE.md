# Farmers architecture

The static Next.js PWA runs on GitHub Pages. A single Node.js 24 Fastify API on DigitalOcean owns SQLite, authentication, anonymous introductions, and the background engine. Hosted Gemma is called through Backboard from the backend. Python, Ollama, local inference, and PostgreSQL are not used.

## Campus boundary

`src/lib/campus-model.ts` defines shared Zod contracts and the controlled category vocabulary. `src/lib/campus-client.ts` exposes complete frontend operations and validates network responses. `src/components/campus` owns bilingual onboarding, interest avatars, suggestions, revealed connections, profile controls, and staff tools.

`server/src/campus-service.ts` owns member documents, proposal projection, independent answers, the quota ledger, events, and durable engine leases. Member documents are small versioned JSON records linked to existing account IDs. Proposals, answers, work leases, and delivery counts use relational tables. No campus directory is sent to clients.

`server/src/campus-routes.ts` authenticates, parses requests, and invokes those operations. `server/src/store.ts` remains the single account/session writer. University-code proof is recorded separately from legacy password authentication. New OTP accounts have password login disabled. Existing bootstrap operator credentials remain valid.

Only the authenticated owner receives their member document and private idea. Anonymous cards have an opaque proposal ID, interest avatar, controlled reasons, expiry, and the actor's own answer. Two persisted yeses permit identity disclosure. A no, expiry, missing member, or withdrawn consent makes the anonymous suggestion disappear. Revealed contacts remain available after the proposal deadline while both members continue to consent.

## Matching and inference

The engine scans at most 200 completed, verified or operator-authorized, consenting member documents. Cheap rules choose compatible goals, shared interests, or the same sport and level with overlapping day and time slot. The server claims a durable singleton run lease and canonical pair jobs before making any model call. It never holds a SQLite write transaction across a network request.

`packages/anonymiser` constructs a new allowlisted input object. It cannot copy names, emails, private ideas, or stable account identifiers. `server/src/backboard.ts` hides the Backboard protocol, explicit model selection, JSON validation, timeouts, and task conversation cleanup. Model prose is never used as a suggestion reason. The service checks returned reason codes against the actual pair facts.

After inference, a short `BEGIN IMMEDIATE` transaction checks lease ownership, unchanged profile revisions, current consent, uniqueness, score threshold, and both delivery counts. Only then does it insert the proposal and both delivery facts. Refusing a suggestion or deleting the other participant does not refund daily quota. Scoring is limited to twelve attempts per run and thirty per Europe/Rome day for live members, with an independent one-hundred-attempt demo budget. Interest and poster calls have separate durable per-user daily limits.

The five-minute scheduler and administrator trigger call the same engine. Failed model requests create no suggestion and do not trigger a silent rules fallback. The shared fictional presentation uses the actual hosted model and SQLite. Its `demo` verification marker restricts matching, suggestions, events, and resets to the demo cohort. The separate local rules preview makes no API calls.

## Hosted privacy

Memory is disabled and conversations are not reused between tasks. Returned task conversations are deleted after parsing, including known failed responses. Cleanup failures emit a content-free operational warning. No zero-retention claim is made for upstream services.

Pair requests contain canonical categories only. Custom interest classification sends separately consented, bounded, pattern-scrubbed text. That scrubber cannot recognize all personal information. Poster reading sends a staff-selected image after explicit disclosure. Private idea analysis is not implemented and private idea text is excluded from every pair request.

## Legacy data and deployment

The original community snapshot and password accounts remain in the same SQLite file. `server/src/campus-legacy.ts` centrally excludes campus members and their social records from legacy projections. Legacy commands reject campus actors and targets. This includes legacy administrator views and exports, so the archive cannot bypass double opt-in.

The PWA caches public static assets. It does not cache API responses or queue commands offline. Existing local sports demo data is separate from the new fictional campus demo. The new demo validates persisted browser data and makes no AI requests.

The private shared-demo passcode enables twelve server-backed fictional identities and 24-hour sessions. Disabling it also gates retained demo members out of scheduled inference. University email delivery and exact domain allowlists are configurable but disabled in the deployed prototype. Interest categories, directory prefills, staff alerts, and resource availability in the demo are fictional or provisional. Live campus data sources, Web Push, private-idea analysis, and a production compliance review remain outside this implementation.

### Campus map integration

`CampusMap` hosts the adapted, bundled Campus Compass map in a same-origin frame. The frame owns Leaflet/GPS and sends validated position messages to its parent; it never receives bearer tokens. The React parent checks origin, source and schema, and only publishes after explicit sharing consent. Incoming matched positions are rendered with text nodes, not interpolated HTML. OpenStreetMap tiles are online-only.

`campus_locations` stores one latest fix per member, with server timestamps. Reads reuse the existing revealed-proposal projection, so consent revocation and cohort separation apply to location as well as identity. Fixes are omitted after two minutes, deleted during map activity, and cascade on account deletion. Demo reset removes demo positions. Only fictional accounts may publish fixes marked simulated. Coordinates do not enter matching prompts. The map endpoints require a valid session and do not return unmatched member IDs.
