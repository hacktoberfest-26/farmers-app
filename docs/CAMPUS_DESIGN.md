# Campus design and decisions

## Problem

The refined product needs proactive anonymous introductions instead of an open sports directory. Retain the deployed Next.js PWA, Node.js, SQLite database, existing accounts, sprout branding, and established tagline. The user's explicit correction replaces local Gemma with hosted Gemma through Backboard, called from DigitalOcean.

## Usage

The frontend calls one client operation for each user action:

```ts
await client.saveProfile(profile);
await client.answer(proposalId, 'yes');
const home = await client.home();
```

The backend composes the existing account owner with one campus capability:

```ts
const campus = new CampusService(store.db, { ai, auth });
campus.saveProfile(actorId, parsedProfile);
campus.answer(actorId, proposalId, 'yes');
await campus.runEngine('demo');
```

`home()` returns only the actor's profile and permitted suggestion cards. It never returns a directory of campus members.

## Shape

Shared Zod contracts live in `src/lib/campus-model.ts`. `CampusService` owns one validated JSON member document per account plus relational proposals, independent answers, durable pair jobs, a global run lease, delivery facts, events, and inference budgets. Account creation and bearer sessions remain owned by `CommunityStore`. `campus-routes.ts` handles HTTP, OTP proof, and paid-task limits. `BackboardGemma` owns provider requests, response validation, and task cleanup. The reusable anonymiser has no database, framework, or network dependency.

Anonymous and revealed cards are a discriminated union. A first yes does not reveal the other answer. Two independent yeses permit identity disclosure. Either no, missing consent, account deletion, or a 72-hour unanswered deadline removes the proposal without a refusal reason. Revealed connections persist beyond the proposal deadline. Withdrawal stops future disclosure but cannot retract information already seen.

Slow inference never runs inside a SQLite write transaction. A durable singleton lease and canonical pair jobs prevent duplicate work. Publication rechecks lease ownership, revisions, consent, score, quota, and pair uniqueness in one transaction. Delivery facts reference only their owner, so deleting another person does not refund quota. Reasons are controlled codes checked against actual profile facts.

The legacy filter excludes campus identities and social records from every old response path, including administrator views. Legacy commands reject campus actors and targets. The archive cannot become a second way to obtain an anonymous partner's identity.

## Synthesis decision

Two independent candidates compared fully normalized campus profiles with member documents plus relational concurrent state. The parent and cross-judge selected member documents. The judge scored that design 24/25 against 22/25 for the normalized design. It concentrates profile writes without sacrificing relational consent and quota controls. Adopted the other candidate's singleton engine lease and shared catalogue checks.

All reviewers used the available inherited model. This was independent review without model diversity.

## Tradeoffs

- Accept bounded scans of 200 member documents for a smaller prototype write boundary.
- Keep private ideas unused by pair scoring rather than forwarding raw text. Owner-agent idea analysis remains deferred.
- Keep constrained reason templates instead of arbitrary model prose.
- Retain protected legacy data rather than destructively migrating the old snapshot.
- Accept possible repeated external inference after a crash, while keeping publication and quota idempotent.

## Alternatives considered

Extending the old community snapshot would make every old projection and export responsible for private ideas and mutual consent. Fully normalized interests, avatars, sports, and profiles add coordinated writes without a current query need. Whole-system event sourcing adds replay and deletion complexity. These alternatives expose more coordination than the chosen capability.

## Implementation reconciliation

The user subsequently required a functional multi-device presentation with real Gemma. A passcode-protected shared fictional cohort now uses ordinary server sessions, SQLite, and the same hosted inference path. Its explicit `demo` verification marker prevents matching or event publication into the live cohort. A separate local rules preview remains available and is never used as a provider failure fallback.

The shared demo request starts background inference and responds promptly; three-second polling displays results as each provider call completes. Private task conversations are deleted afterward. No zero-retention claim is made for upstream services. Names, emails, course, year, stable IDs, and private ideas are absent from pair prompts. Separately consented custom-interest text and poster images have their own disclosed provider inputs.

Demo and live scoring budgets are independent, with 100 and 30 daily attempts respectively. The same three-introduction delivery cap applies to each persona. Only the actual deployment operator can clear shared fictional proposals, answers, and delivery facts. Reset preserves profile edits and inference-use budgets. A generation fence discards pre-reset results and stops the old run from claiming more demo work. Removing the demo passcode disables both access and scheduled scoring for retained demo members. The single production process recovers interrupted leases before opening HTTP traffic, so a restart does not leave the presentation waiting on a stopped process.

University SMTP and exact domain allowlists remain unconfigured by the user's choice. Operator access and the shared fictional demonstration are the supported presentation routes. Directory prefills and the provisional category list do not imply a real university integration.

## Remaining integrations

Approved H-FARM categories, a real university directory, campus events and sensor feeds, email delivery, and private-idea analysis need separate inputs or implementation. They do not change the completed anonymous-match contract.
