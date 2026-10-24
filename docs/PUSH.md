# PWA notifications

Farmers uses standards-based Web Push from the Node API. In the shared demo or live account, open Profile → Notifications → Enable notifications. On iPhone/iPad (16.4+), first add Farmers to the Home Screen and open it from its icon. Send test notification checks the complete provider path. A provider accepting a test does not prove the OS displayed it; check the device notification centre and Focus settings.

Each device subscribes explicitly. New suggestions and mutual matches generate generic notifications with no names, contact details, interests, or locations. Opening a notification opens Matches; authentication may be required. The local rules preview does not send push. Subscriptions are tied to the current server session: logout, demo-persona switch and account deletion remove the binding. Expired sessions stop delivery (shared demo sessions last 24 hours). Re-enable after signing in again. Browser permission alone does not bind a new account automatically.

## Operations

Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in the private API environment. Generate keys once with web-push.generateVAPIDKeys(); keep the private key server-side and preserve the pair across deployments. The public key comes from the authenticated status endpoint, so Pages needs no secret or extra build variable.

The worker runs every five seconds, independently of the five-minute AI scheduler. Each subscription present at event time gets a durable SQLite job. No historical flood occurs on opt-in. Jobs retry at most three times; expired push endpoints (404/410) are removed. Stale, declined, revoked or expired suggestions are suppressed by the same projection used for the app. Jobs expire after 24 hours. Push providers retain accepted messages for at most five minutes. Revocation cannot retract an already accepted message. Delivery is best effort: crashes after provider acceptance can duplicate a notification, while a stable per-event/proposal tag coalesces its visible notification.

## Design and synthesis

Grounding: CampusService owns matching transactions and visibility; routes own authentication; auth_sessions owns revocation. The old unmounted app was the only service-worker registrar; the mounted campus shell now registers it.

Compared transaction outbox (A) with derived-projection polling (B). Independent cross-judge scored A 23/25 and B 16/25 on durability, identity isolation, ownership, latency and verification. Selected A: enqueue during publish and second-yes transactions. Adopted B's injected sender and application shutdown lifecycle. Rejected projection baselines and five-minute notification polling because they add bookkeeping and delay mutual-match alerts.

Contract: CampusService.notify(proposalId, recipients, kind) inserts jobs synchronously in the existing transaction. CampusPush owns subscription validation, session binding, queue, retry and transport; its flush() serializes one deployed worker in process. The routes start/stop the five-second worker. Matching's home projection is injected for dispatch authorization. Foreign keys cascade jobs on session/subscription/proposal removal. Subscription endpoints are restricted to browser push-provider HTTPS hosts.

Implementation deviations accepted in synthesis: a test notification sends directly through the same transport and returns provider acceptance, without adding a test queue. Completed jobs are deleted because producer transactions already make the transitions idempotent. A persisted due time is a restart lease; an in-process shared promise prevents overlapping flush calls in the current single-process deployment. Multiple API workers would require lease ownership tokens before scaling.

Verification covers new/second-yes events, retry idempotence, restart recovery, no history replay, session/consent isolation, endpoint expiry, test ownership and SSRF rejection. Device OS delivery still requires an installed PWA with user-granted permission.

Final review caught tag reuse suppressing the second alert; suggestion and mutual-match tags now differ while retries keep the same tag.
