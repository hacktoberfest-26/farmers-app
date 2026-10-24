# Implementation status

Product: Farmers. Tagline: Harvest your future / By shaping your identity.

The refined specification replaces the sports-directory homepage with a proactive campus agent. The user's decisions retain Next.js PWA, Node.js, SQLite, the sprout identity, and hosted Gemma through Backboard from DigitalOcean.

- [x] Compare two design candidates and obtain an independent cross-judgement.
- [x] Implement strict private member documents, controlled anonymisation, real Backboard adapter and conversation cleanup.
- [x] Implement four onboarding screens, interest avatars, bilingual UI, anonymous proposals, bilateral reveal, consent controls, export and deletion.
- [x] Prevent the legacy sports API from exposing campus identities.
- [x] Implement durable leases, duplicate protection, 72-hour proposal expiry, bounded inference and three daily introductions per person.
- [x] Implement configurable university OTP delivery with hashes, expiry, attempt limits and one-time consumption. Delivery remains disabled by user choice.
- [x] Verify actual Gemma scoring and the full two-yes flow from DigitalOcean using an isolated temporary SQLite database.
- [x] Implement passcode-protected shared fictional accounts, real server inference, independent device sessions and three-second synchronization.
- [x] Implement demo/live cohort isolation, staff event isolation and operator-only demo reset with in-flight generation fencing.
- [x] Check local browser onboarding, first-yes anonymity, two-yes reveal and mobile layout at 390px.
- [x] Deploy the shared presentation API and Pages PWA; GitHub Actions build and deployment succeeded with 60 tests.
- [x] Verify actual shared Gemma proposals with two independent deployed API sessions: first yes stays private and second yes reveals identity in both sessions. Reset only fictional votes and request fresh anonymous cards afterward.
- Final visual check of the newly deployed shared sign-in could not complete because Chrome control stopped responding. The earlier local desktop/mobile walkthrough and deployed API checks passed.

The local rules preview is explicitly separate from the shared Gemma demonstration. All demo identities, alerts and directory prefills are fictional. Interest categories are provisional. No real campus directory, sensor feed, Web Push, or private-idea analysis is connected.
