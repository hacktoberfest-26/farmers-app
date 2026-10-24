# Operator dashboard and match feedback

Open `/admin/` and sign in using Operator access, or choose Admin from the account menu of an operator session. Shared demo personas, including fictional staff, cannot enter. The four normal mobile tabs remain unchanged.

The read-only dashboard includes Overview, Users, Matches, Map, Feedback, Events and Operations. Demo/live filters apply to directories and metrics; global AI engine state and both daily budgets are explicitly labeled global. Lists support search and pages of 20 (API maximum 100). Totals are calculated before pagination. Current positions appear only while explicitly shared and less than two minutes old. There is no location history. Operator visibility is disclosed beside the map sharing control. Session tokens, passwords, OTP hashes, push endpoints/keys and private idea text never appear in admin responses.

Operations shows recorded inference attempts, interest/poster tasks, current matching job states, active push devices and the current push queue. Inference attempts include errors. Push jobs are removed after success: no historical delivered count or phone-display success rate is claimed.

## Feedback

Each participant in a mutual match can save a 1–5 usefulness rating, outcome (`met`, `planned`, `did-not-meet`) and optional comment up to 1,000 characters. The comment is visible to its author and the deployment operator, never the matched partner, and is not sent to Gemma. Authors may edit their own response while the connection remains available. Feedback remains in admin history after consent withdrawal/revocation, but edits then stop. Account deletion and operator demo reset cascade the associated feedback records.

SQLite `campus_match_feedback` has a `(proposal_id,user_id)` primary key, checked rating/outcome, comment, created timestamp and updated timestamp. Upserts preserve the creation timestamp. The author is always derived from authentication, and both participants must have accepted. Shared demo persists on the server across devices; local rules preview stores its fictional feedback only in its existing local demo state.

Admin aggregates distinguish participant responses from distinct rated matches. The response-rate denominator is two participants for every retained proposal with two yes answers, including later-revoked connections. Average rating and outcome distributions use each participant's latest saved response. Pagination never changes statistics.

## API

- `GET /api/campus/admin/overview?scope=all|demo|live`
- `GET /api/campus/admin/{users,matches,locations,feedback,events}?scope=all&page=0&limit=20&q=...&status=all`
- `POST /api/campus/matches/:id/feedback` with `{rating,outcome,comment}`; returns the caller's normal campus projection including only their own feedback.

Admin authorization requires both stored role `admin` and verification `operator`. Every admin response sends `Cache-Control: no-store`. Admin data stays in component memory, clears on query errors and unmounts on sign-out/account change. No generic SQL or raw-document endpoint exists.

## Design rationale and validation

Compared a separate reporting service (A) with expanding CampusService (B). Independent cross-judge chose A, 19/20 versus 15/20, for bounded capability APIs, maintainability and mobile UI. Grafted B's shared authoritative `campusMemberEligible` helper for consent and location eligibility. CampusService retains transactional feedback ownership and participant projection.

Prototype tradeoff: CampusAdmin computes a synchronous internal snapshot of current records, with safe explicit response schemas and bounded outgoing pages. This avoids hard caps that hide users and avoids separate SQL copies of consent policy. It is suitable for the current prototype; larger datasets should move directory paging and aggregates into database queries while retaining policy parity tests. No materialized reporting cache or duplicated reporting state is maintained.

Tests exercise anonymous/student/staff rejection, genuine operator access, no-store headers, safe field projection, account-without-profile visibility, search and page totals, cohort separation, active-location expiry, mutual matches past suggestion expiry, feedback ownership, partner privacy, update deduplication, aggregate values and revoked-match edit rejection. Final independent review found no actionable correctness or security issue against this contract.

Local browser verification: operator login, feedback directory, participant rating/comment submission, and dashboard aggregates were exercised against an isolated SQLite fixture. Two responses produced a 4.5/5 average and 100% response rate. Production demo records were not filled with test feedback.
