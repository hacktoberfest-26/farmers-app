# Farmers

Harvest your future. By shaping your identity.

Farmers is a proactive campus agent for the H-FARM community. It suggests people and opportunities, explains why a suggestion fits, and reveals a person's name and university contact only after both participants accept.

The PWA runs at [farmers.johno.it](https://farmers.johno.it). A Node.js API on DigitalOcean stores data in SQLite and calls hosted Gemma 4 through Backboard. The API origin is `https://api.farmers.johno.it`.

See [the multi-device demo guide](docs/DEMO.md) to present with Alex and Mia on separate phones. Shared demo sessions sync through the API every three seconds. The private demo passcode is never bundled with the PWA.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000` and choose the fictional demo. It uses isolated browser storage, twelve fictional people, and clearly labelled rules-based suggestions. It makes no AI requests and does not create live accounts. Demo controls let you switch people to show both sides of an introduction.

For the shared API, configure a private environment file from `server/.env.example` and run `npm run api:start`. Set `NEXT_PUBLIC_API_URL` when building the frontend. Production uses Node.js 24. Node.js 22 requires a version with `node:sqlite` support.

## Current flow

- Four-screen onboarding collects interests, optional sport preferences, current goals, skills, an optional private idea, avatar colour, and data-source consent.
- Original vector avatars use interest accessories, never face photographs.
- The server filters compatible pairs, sends only controlled category data to Gemma, validates the score and reason codes, and publishes qualifying suggestions.
- Each person sees an anonymous avatar. The first yes stays anonymous. Two yeses reveal name, course, year, and contact email. Refusal and expiry close silently.
- Unanswered proposals expire after 72 hours. Matching sends at most three suggestions per person per Europe/Rome day. A scheduler and the admin button use the same bounded engine.
- Users can withdraw matching consent, export their own data, and delete their account. Withdrawal prevents future identity disclosure; it cannot erase information already seen by another person.
- English and Italian interfaces, installable PWA assets, staff poster extraction, and interest normalisation are included. Staff alerts and campus resources in the fictional demo are examples.

The deployed prototype offers a passcode-protected shared fictional demo with real Gemma, operator password access, and a separate local rules preview. University-code sign-in remains disabled by the operator's choice until SMTP delivery and approved domains are configured. Mocked directory entries in the demo do not prove real affiliation.

## Hosted AI and private data

`BACKBOARD_API_KEY` belongs only in the server's private environment. Never put it in `NEXT_PUBLIC_*`, GitHub Pages variables, source, logs, or a browser bundle.

Pair scoring receives approved interest, skill, goal, and sport IDs with coarse availability. It receives no names, emails, account IDs, course, year, arbitrary profile text, or private idea text. Private ideas are stored for their owner; analysis of those ideas is not implemented. Free-text interest classification has separate explicit consent and pattern scrubbing, which cannot guarantee removal of personal names. Poster upload explicitly sends the selected image to the hosted service.

Backboard calls disable memory and use a fresh task conversation. The server deletes returned task conversations after use and reports cleanup failures without logging their contents. This does not promise zero retention by Backboard or upstream providers. Hosted matching needs connectivity.

The current category list is provisional. Replace it with the approved H-FARM services and communities list before presenting the tiles as official campus offerings. No real university directory or resource sensor is connected.

## Verify

```sh
npm run typecheck
npm test
npm run build
node --env-file=.env.backboard --import tsx scripts/verify-backboard.ts
```

The last command makes one small paid inference request using fictional category data and verifies temporary conversation cleanup. It requires a private Backboard environment file. The other tests run locally without an external AI service and use real SQLite for authentication, consent, quotas, and persistence.

See [Architecture](docs/ARCHITECTURE.md), [Campus design](docs/CAMPUS_DESIGN.md), and [Deployment](docs/DEPLOYMENT.md). The original sports snapshot remains behind an archive API for existing data. Campus accounts cannot use that API to bypass anonymous matching.

The repository retains its [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_ASSETS.md), [trademarks](TRADEMARKS.md), and [security policy](SECURITY.md).
