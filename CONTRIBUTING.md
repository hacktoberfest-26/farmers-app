# Contributing to Farmers

Thanks for helping improve Farmers. Contributions should preserve English/Italian support, visibly fictional sample content, and the distinction between browser-local demo data and shared API data.

## Before you start

- Check existing issues and pull requests for related work.
- For a substantial change, open an issue or discussion first so scope is clear.
- Do not add real member information, private contact details, credentials, tokens, or unverified facility claims to fixtures or screenshots.
- Keep local demo profile switching clearly separate from real API accounts.

## Development

Use Node.js 22.20 for local API work (where `node:sqlite` is experimental) and npm:

```sh
npm ci
npm run dev
```

Before submitting a pull request, run:

```sh
npm run typecheck
npm test
npm run build
```

The browser database uses SQLite WebAssembly and IndexedDB. The server uses Node.js `node:sqlite` and a persistent SQLite file. Database changes should preserve versioned metadata for community settings and the selected profile ID, and the convention of one JSON document per entity row. Include a safe migration or reset plan when changing that schema.

## Pull requests

Keep changes focused and explain user-visible behavior, data impact, and how you checked it. Include screenshots for meaningful interface changes. Update both locale dictionaries when adding interface text. Keep demo names and facility data clearly fictional or unverified. Document backend environment changes and operator actions.

## Community expectations

Participation in project spaces is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security reports should follow [SECURITY.md](SECURITY.md). H-FARM marks and third-party assets have separate terms; see [TRADEMARKS.md](TRADEMARKS.md) and [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).
