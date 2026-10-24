import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import webpush from 'web-push';
import { z } from 'zod';
import { pushSubscriptionSchema, type DeviceSubscription, type PushStatus } from '../../src/lib/push-model';
import { CampusError } from './campus-service';

export type PushKind = 'suggestion' | 'match';
type Payload = { kind: PushKind | 'test'; tag: string; locale: 'en' | 'it' };
export type PushTransport = { publicKey: string; send: (subscription: DeviceSubscription, payload: Payload) => Promise<void> };
export function pushConfiguration(env: NodeJS.ProcessEnv): PushTransport | undefined {
  if (!env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY) return;
  const details = { publicKey: env.VAPID_PUBLIC_KEY ?? '', privateKey: env.VAPID_PRIVATE_KEY ?? '', subject: env.VAPID_SUBJECT ?? '' };
  webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
  return { publicKey: details.publicKey, send: async (subscription, payload) => {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { vapidDetails: details, TTL: 300, timeout: 10000, urgency: 'normal' });
  } };
}
const subscriptionRow = z.object({ id: z.string(), user_id: z.string(), session_hash: z.string(), document: z.string(), locale: z.enum(['en', 'it']) });
const jobRow = z.object({ id: z.string(), subscription_id: z.string(), proposal_id: z.string().nullable(), kind: z.enum(['suggestion', 'match', 'test']), attempts: z.number() });
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Durable per-device delivery. Enqueue participates in the caller's domain transaction. */
export class CampusPush {
  private running: Promise<void> | null = null;
  constructor(private readonly db: DatabaseSync, private readonly transport: PushTransport | undefined,
    private readonly visible: (userId: string, proposalId: string, kind: PushKind) => boolean,
    private readonly now = Date.now) {
    db.exec(`CREATE TABLE IF NOT EXISTS campus_push_subscriptions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES campus_members(user_id) ON DELETE CASCADE,
      session_hash TEXT NOT NULL REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE, document TEXT NOT NULL, locale TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS campus_push_user ON campus_push_subscriptions(user_id);
      CREATE TABLE IF NOT EXISTS campus_push_jobs (
      id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES campus_push_subscriptions(id) ON DELETE CASCADE,
      proposal_id TEXT REFERENCES campus_proposals(id) ON DELETE CASCADE, kind TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL, created INTEGER NOT NULL,
      UNIQUE(subscription_id,proposal_id,kind));
      CREATE INDEX IF NOT EXISTS campus_push_due ON campus_push_jobs(due);`);
  }
  private session(token: string) {
    const value = this.db.prepare('SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at>?').get(hash(token), this.now());
    if (!value) throw new CampusError(401, 'Sign in again to enable notifications');
    return { userId: z.object({ user_id: z.string() }).parse(value).user_id, sessionHash: hash(token) };
  }
  status(token: string, endpoint: string | null): PushStatus {
    const actor = this.session(token);
    return { publicKey: this.transport?.publicKey ?? null, enabled: !!this.transport && !!endpoint && !!this.db.prepare('SELECT 1 FROM campus_push_subscriptions WHERE endpoint=? AND session_hash=?').get(endpoint, actor.sessionHash) };
  }
  subscribe(token: string, input: DeviceSubscription, locale: 'en' | 'it'): PushStatus {
    if (!this.transport) throw new CampusError(503, 'Notifications are not configured yet');
    const actor = this.session(token), subscription = pushSubscriptionSchema.parse(input);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Changing the identity bound to this device invalidates its old queued notifications.
      this.db.prepare('DELETE FROM campus_push_subscriptions WHERE endpoint=? AND session_hash<>?').run(subscription.endpoint, actor.sessionHash);
      const count = z.object({ total: z.number() }).parse(this.db.prepare('SELECT COUNT(*) AS total FROM campus_push_subscriptions WHERE user_id=?').get(actor.userId)).total;
      if (count >= 10 && !this.status(token, subscription.endpoint).enabled) throw new CampusError(429, 'Device limit reached. Disable notifications on another device first.');
      this.db.prepare(`INSERT INTO campus_push_subscriptions(id,user_id,session_hash,endpoint,document,locale) VALUES(?,?,?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET document=excluded.document,locale=excluded.locale`)
        .run(randomUUID(), actor.userId, actor.sessionHash, subscription.endpoint, JSON.stringify(subscription), locale);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.status(token, subscription.endpoint);
  }
  unsubscribe(token: string, endpoint: string) {
    this.db.prepare('DELETE FROM campus_push_subscriptions WHERE endpoint=? AND session_hash=?').run(endpoint, this.session(token).sessionHash);
    return this.status(token, endpoint);
  }
  enqueue(proposalId: string, recipients: readonly string[], kind: PushKind) {
    if (!this.transport) return;
    for (const userId of recipients) {
      const rows = this.db.prepare('SELECT s.* FROM campus_push_subscriptions s JOIN auth_sessions a ON a.token_hash=s.session_hash WHERE s.user_id=? AND a.expires_at>?').all(userId, this.now());
      for (const raw of rows) {
        const subscription = subscriptionRow.parse(raw);
        this.db.prepare('INSERT OR IGNORE INTO campus_push_jobs(id,subscription_id,proposal_id,kind,due,created) VALUES(?,?,?,?,?,?)')
          .run(randomUUID(), subscription.id, proposalId, kind, this.now(), this.now());
      }
    }
  }
  async test(token: string, endpoint: string) {
    const actor = this.session(token);
    const raw = this.db.prepare('SELECT * FROM campus_push_subscriptions WHERE endpoint=? AND session_hash=?').get(endpoint, actor.sessionHash);
    if (!raw || !this.transport) throw new CampusError(409, 'Enable notifications for this account on this device first');
    const subscription = subscriptionRow.parse(raw);
    try { await this.transport.send(pushSubscriptionSchema.parse(JSON.parse(subscription.document)), { kind: 'test', tag: 'farmers-test', locale: subscription.locale }); }
    catch (error) { this.removeExpired(subscription.id, error); throw new CampusError(503, 'The push provider could not accept the test. Try enabling notifications again.'); }
    return { accepted: true };
  }
  private removeExpired(id: string, error: unknown): boolean {
    const result = z.object({ statusCode: z.number() }).safeParse(error);
    if (result.success && [404, 410].includes(result.data.statusCode)) {
      this.db.prepare('DELETE FROM campus_push_subscriptions WHERE id=?').run(id); return true;
    }
    return false;
  }
  flush(): Promise<void> {
    if (!this.running) this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }
  private async drain() {
    if (!this.transport) return;
    this.db.prepare('DELETE FROM campus_push_subscriptions WHERE session_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at<=?)').run(this.now());
    this.db.prepare('DELETE FROM campus_push_jobs WHERE attempts>=3 OR created<?').run(this.now() - 86400000);
    const jobs = this.db.prepare('SELECT * FROM campus_push_jobs WHERE due<=? ORDER BY due LIMIT 30').all(this.now()).map(raw => jobRow.parse(raw));
    for (const job of jobs) {
      const raw = this.db.prepare('SELECT s.* FROM campus_push_subscriptions s JOIN auth_sessions a ON a.token_hash=s.session_hash WHERE s.id=? AND a.expires_at>?').get(job.subscription_id, this.now());
      if (!raw) continue;
      const subscription = subscriptionRow.parse(raw);
      if (job.kind !== 'test' && (!job.proposal_id || !this.visible(subscription.user_id, job.proposal_id, job.kind))) {
        this.db.prepare('DELETE FROM campus_push_jobs WHERE id=?').run(job.id); continue;
      }
      // A persisted lease prevents immediate replay after a crash. Provider acceptance is at least once.
      const claimed = this.db.prepare('UPDATE campus_push_jobs SET attempts=attempts+1,due=? WHERE id=? AND due<=? AND attempts<3').run(this.now() + 60000, job.id, this.now());
      if (!claimed.changes) continue;
      try {
        await this.transport.send(pushSubscriptionSchema.parse(JSON.parse(subscription.document)), { kind: job.kind, tag: `farmers-${job.kind}-${job.proposal_id ?? job.id}`, locale: subscription.locale });
        this.db.prepare('DELETE FROM campus_push_jobs WHERE id=?').run(job.id);
      } catch (error) {
        if (!this.removeExpired(subscription.id, error)) this.db.prepare('UPDATE campus_push_jobs SET due=? WHERE id=?').run(this.now() + 60000 * 2 ** job.attempts, job.id);
      }
    }
  }
}
