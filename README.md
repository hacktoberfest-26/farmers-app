# Farmers

**Harvest your future. By shaping your identity.** Farmers is a bilingual sports-community prototype built with Next.js, React, TypeScript, Tailwind CSS, next-intl, SQLite, and Node.js.

The static PWA runs on GitHub Pages. It has two data modes:

- **Local demo:** When `NEXT_PUBLIC_API_URL` is empty, SQLite WebAssembly runs in the browser and stores data in IndexedDB. Profiles are fictional and can be switched to explore requests, connections, acceptance, and messages. The database belongs to this browser and origin.
- **Shared API:** When `NEXT_PUBLIC_API_URL` is set at build time, the frontend uses the Node.js API. Accounts, memberships, sessions, connections, and messages are stored in the server’s SQLite database and shared between browsers. Set `USE_DEMO_DATA=false` on the API for real account mode; the content seed may still include visibly fictional sports guides and venue examples.

The API uses password hashing with scrypt and bearer tokens whose hashes are stored server-side. The raw token is kept in browser `sessionStorage` for the current tab. There is no cookie session. This is an early prototype with no verified email transport, so registration does not prove email ownership. Treat account identity and adult attestation accordingly.

## Try the local demo

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and choose English or Italian. The bundled sample people and sessions are fictional. Venue names, locations, prices, hours, access instructions, and booking details are examples and have not been verified. Do not enter real personal or sensitive information.

Run checks and create a static export with:

```sh
npm run typecheck
npm test
npm run build
```

The static site is written to `out/`. The build prepares PWA files and copies the SQLite WebAssembly runtime into `public/vendor/`.

## Prototype features

- English and Italian interface strings and sport guides.
- Nine sports, activity formats, equipment guidance, and safety tips.
- Fictional local profiles, matching recommendations, availability, sessions, and community announcements.
- Local profile switching and social flows for reviewing connection requests, acceptance, and messaging.
- Shared-account, membership, session, and message flows when the Node API is configured.
- SQLite data stored in browser IndexedDB for demo mode or on persistent server storage for API mode.
- Static PWA shell with a service worker for previously loaded assets.

Browser demo tables store JSON records with versioned metadata. The server stores the community snapshot and separate authentication tables in one SQLite file. The profile screen exports personal data as JSON.

## Important limits

This is a prototype, not a production-ready community service. Browser-only mode has no real authentication or shared state; profile switching is a simulation. Local storage is under the browser user’s control and is not confidential or tamper-proof.

API mode supplies real shared accounts and membership state, but email verification delivery and account recovery are not configured. Accounts start pending and require admin approval, except the administrator created at server startup from private `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` settings. Adult status is an attestation, not age verification. Use with real members requires operators to assess identity, support, moderation, backups, privacy obligations, and operational security. Do not use with minors without a separately designed and reviewed safeguarding system.

The prototype has no push notifications or calendar integration. Joining a Farmers session does not book a facility. Replace the fictional venue data and unverified prices before presenting any listings as facts. The project does not claim GDPR certification or legal compliance for any specific operator.

The UI can refuse interactive commands while the browser reports offline, even for local demo data. After the first load, the bundled SQLite WebAssembly runtime can initialize offline, but it and the page must first be downloaded.

## Deployment

The frontend domain is `https://farmers.johno.it`. The Node.js API runs at `https://api.farmers.johno.it` on a dedicated DigitalOcean Droplet. The GitHub repository remains `johnou/HCommunity`.

See [Deployment](docs/DEPLOYMENT.md) for GitHub Pages and DigitalOcean Docker setup. Static frontend configuration is compiled at build time; changing `NEXT_PUBLIC_API_URL` requires a new Pages build.

## Project map

- `src/lib/model.ts`: Zod schemas and domain types.
- `src/lib/policy.ts`: matching and local command rules.
- `src/lib/client.ts`: browser or API client selection and commands.
- `src/components/`: application screens and shared UI.
- `src/messages/`: English and Italian dictionaries.
- `public/vendor/`: bundled SQLite WebAssembly runtime.
- `docs/ARCHITECTURE.md`: domain boundary and data model.

## Contributing and licenses

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. This repository retains its existing [MIT License](LICENSE). H-FARM names and logos are not granted by that license; see [TRADEMARKS.md](TRADEMARKS.md). See [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) for dependency and asset guidance.
