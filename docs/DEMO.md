# Present Farmers on multiple devices

The shared fictional demo uses the real Node.js API, server-side SQLite, and Gemma 4 through Backboard. All devices see the same proposals and answers. The separate local rules preview makes no AI calls and does not sync.

## Connect two devices

1. Open `https://farmers.johno.it` on both devices.
2. Select **Shared demo**. Enter the private demo passcode on each device.
3. Choose **Alex Neri** on device A and **Mia Verde** on device B.
4. On either device, click **Run matching now**. The request starts background Gemma scoring and returns promptly. The first proposal appears after the provider finishes its request. Other suggestions continue in the background.
5. Both devices receive the same anonymous co-founder proposal. Click **I'm interested** on device A. Device B still sees an anonymous card.
6. Click **I'm interested** on device B. Open **Connections** on either device. Each now sees the other's fictional name, course, and contact email.

Shared demo views poll every three seconds while visible. Use Refresh if a phone has been asleep. Every device has its own bearer session. Switching one device to another fictional person does not sign out the other devices.

Use **Profile → Edit profile** to present the four onboarding screens. New profile revisions and consent choices persist on the server. Fictional accounts are shared with all participants who have the demo passcode. Use invented information. Do not put confidential material in a shared persona.

## Show the AI features

Use **Something else?** in the interest step with its hosted-text consent checked to classify a new interest through Gemma. The result must be one of the provisional category IDs or no match. No rules fallback replaces an AI error.

Choose **Nina Prati** for the fictional staff view. It contains a labelled example guest alert. Poster upload sends the selected image through the actual hosted Gemma adapter and stores an extracted event in the demo cohort. Use a readable poster under 2 MB with a full date, year, time, and place. Events cannot cross between demo and live members.

## Prepare another presentation

Sign out and use **Operator / existing account** with the private bootstrap credentials. Complete the operator profile if needed. In **Staff**, choose **Reset shared demo** and type `RESET DEMO`.

Reset clears fictional proposals, answers, and delivery quotas. It preserves profile edits, actual accounts, and the inference-use budget. In-flight pre-reset results cannot republish old demo work. Run matching again from a fictional account afterward. Matching still caps delivery at three introductions per persona per campus day.

The server permits up to 100 demo scoring attempts per Europe/Rome day, independently of the live cohort's 30. Repeated resets do not refund this paid-call budget. Interest classification and poster reading have separate per-account daily limits. The provider's configured credentials and billing must remain active.

## Private configuration

`CAMPUS_DEMO_CODE` enables the shared demo and protects sign-in. Removing it disables shared access and prevents the scheduler from scoring retained demo members. `BACKBOARD_API_KEY`, `BACKBOARD_PROVIDER`, and `BACKBOARD_MODEL` are server-only. They must never appear in a frontend build or public URL.

The operator retains the passcode and administrator credentials in ignored local environment files and the Droplet's private environment. University email-code sign-in stays disabled until SMTP and exact approved domains are configured.

## Campus map

The October design update uses the supplied Farmers logo, tractor avatars, red/ocean palette and illustrated campus artwork. The interactive map integrates Campus Compass from `hacktoberfest2026/campus-compass`, preserving real GPS accuracy, follow/zoom controls and the simulated walk. OpenStreetMap attribution remains visible. The supplied illustration appears on the home screen; geographic positions use the actual map tiles, since the illustration has no georeferenced bounds.

After both fictional people accept their introduction, open **Map** on each device. Choose **Share with my matches**, then **Take a test walk** in the map controls. Both participants appear with labelled simulated positions. Select a person below the map to centre on them. For real GPS, choose **Use my location** and grant the browser permission yourself.

Sharing starts off. Only current mutual matches can retrieve another person's location; staff have no extra access. Choose **Stop sharing with matches** to remove the shared fix. **Stop GPS / demo walk** also removes it while sharing is enabled. Updates are sent at most once every five seconds. Positions expire after two minutes without an update; leaving the map or closing the app stops tracking. GPS runs only while this page is open. Public fictional personas share account state, so use simulated positions for presentations.

The local rules preview can demonstrate the map and simulated walk, but shared positions require the server-backed shared demo. Location is never sent to Gemma. No restaurant menus, guest whereabouts or sports occupancy are inferred from the example mockups.
