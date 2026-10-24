import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { CampusService } from '../server/src/campus-service';
import { CampusPush, type PushTransport } from '../server/src/push';
import { initialCampusProfile } from '../src/lib/campus-model';
import { pushSubscriptionSchema, type DeviceSubscription } from '../src/lib/push-model';

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const subscription = (device: string): DeviceSubscription => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${device}`, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } });
function fixture() {
  const db = new DatabaseSync(':memory:'); databases.push(db);
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE auth_users(id TEXT PRIMARY KEY); CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);');
  let now = Date.now();
  const sent: { endpoint: string; payload: Parameters<PushTransport['send']>[1] }[] = [];
  const transport: PushTransport = { publicKey: 'test', send: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); } };
  const campus = new CampusService(db, { now: () => now, ai: { model: 'test', score: async () => ({ score: 90, reasonCodes: ['shared_interests'] }), normalise: async () => null, readPoster: async () => { throw new Error('not used'); } }, auth: { emailEnabled: false, domains: [] }, notify: (id, people, kind) => push.enqueue(id, people, kind) });
  const visible = (userId: string, proposalId: string, kind: 'suggestion' | 'match') => campus.home(userId).suggestions.some(m => m.id === proposalId && m.kind === (kind === 'match' ? 'revealed' : 'anonymous'));
  const push = new CampusPush(db, transport, visible, () => now);
  const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
  for (const id of ['alice', 'bob']) {
    db.prepare('INSERT INTO auth_users VALUES(?)').run(id);
    db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(tokenHash(id), id, now + 86400000);
    campus.ensureMember({ id, email: `${id}@example.test`, name: `Secret ${id}`, role: 'student', verification: 'email' });
    campus.saveProfile(id, { ...initialCampusProfile(`Secret ${id}`), lookingFor: ['cofounder'], consent: { matching: true, hostedAi: true, events: false, resources: false } });
  }
  return { db, campus, push, sent, transport, visible, tokenHash, advance: (ms: number) => { now += ms; }, now: () => now };
}

it('durably notifies both devices for a new suggestion and second yes, never first yes or retries', async () => {
  const f = fixture();
  f.push.subscribe('alice', subscription('a'), 'en'); f.push.subscribe('bob', subscription('b'), 'it');
  await f.campus.runEngine();
  // A fresh worker instance can deliver jobs committed before a process restart.
  const resumed = new CampusPush(f.db, f.transport, f.visible, f.now);
  await resumed.flush(); expect(f.sent.map(s => s.payload.kind)).toEqual(['suggestion', 'suggestion']);
  const id = f.campus.home('alice').suggestions[0].id;
  f.campus.answer('alice', id, 'yes'); await resumed.flush(); expect(f.sent).toHaveLength(2);
  f.campus.answer('bob', id, 'yes'); f.campus.answer('bob', id, 'yes'); await resumed.flush();
  expect(f.sent.map(s => s.payload.kind)).toEqual(['suggestion', 'suggestion', 'match', 'match']);
  expect(JSON.stringify(f.sent)).not.toMatch(/Secret|example.test/);
  await f.campus.runEngine(); await resumed.flush(); expect(f.sent).toHaveLength(4);
});

it('does not send historical suggestions when a new device opts in', async () => {
  const f = fixture(); await f.campus.runEngine();
  f.push.subscribe('alice', subscription('a'), 'en'); await f.push.flush(); expect(f.sent).toEqual([]);
});

it('drops pending delivery on withdrawal, session expiry, logout and device reassignment', async () => {
  const f = fixture();
  f.push.subscribe('alice', subscription('a'), 'en'); f.push.subscribe('bob', subscription('b'), 'en');
  await f.campus.runEngine();
  f.push.subscribe('bob', subscription('a'), 'en'); // Rebinding deletes Alice's queued work.
  expect(f.push.status('alice', subscription('a').endpoint).enabled).toBe(false);
  f.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(f.tokenHash('bob'));
  await f.push.flush(); expect(f.sent).toEqual([]);
  const g = fixture(); g.push.subscribe('alice', subscription('a'), 'en'); await g.campus.runEngine();
  const profile = g.campus.home('alice').me!.profile;
  g.campus.saveProfile('alice', { ...profile, consent: { ...profile.consent, matching: false } });
  await g.push.flush(); expect(g.sent).toEqual([]);
  const h = fixture(); h.push.subscribe('alice', subscription('a'), 'en'); await h.campus.runEngine();
  h.advance(86400001); await h.push.flush(); expect(h.sent).toEqual([]);
});

it('retries transient failures only three times and removes expired provider endpoints', async () => {
  const f = fixture(); let attempts = 0;
  f.transport.send = async () => { attempts++; throw { statusCode: 503 }; };
  f.push.subscribe('alice', subscription('a'), 'en'); await f.campus.runEngine();
  for (let n = 0; n < 5; n++) { await f.push.flush(); f.advance(300000); }
  expect(attempts).toBe(3);
  const g = fixture(); g.transport.send = async () => { throw { statusCode: 410 }; };
  g.push.subscribe('alice', subscription('a'), 'en'); await g.campus.runEngine(); await g.push.flush();
  expect(g.push.status('alice', subscription('a').endpoint).enabled).toBe(false);
});

it('only tests or disables a device owned by the current session', async () => {
  const f = fixture(); f.push.subscribe('alice', subscription('a'), 'en');
  await expect(f.push.test('bob', subscription('a').endpoint)).rejects.toThrow('Enable notifications');
  f.push.unsubscribe('bob', subscription('a').endpoint);
  expect(f.push.status('alice', subscription('a').endpoint).enabled).toBe(true);
  await f.push.test('alice', subscription('a').endpoint); expect(f.sent[0].payload.kind).toBe('test');
  f.push.unsubscribe('alice', subscription('a').endpoint); expect(f.push.status('alice', subscription('a').endpoint).enabled).toBe(false);
});

it('rejects arbitrary server request destinations and malformed subscription keys', () => {
  for (const endpoint of ['http://127.0.0.1/a', 'https://api.farmers.johno.it', 'https://fcm.googleapis.com.evil.test/a', 'https://fcm.googleapis.com:8443/a', 'https://user:password@fcm.googleapis.com/a']) {
    expect(pushSubscriptionSchema.safeParse({ ...subscription('a'), endpoint }).success).toBe(false);
  }
  expect(pushSubscriptionSchema.safeParse({ ...subscription('a'), keys: { p256dh: 'bad', auth: 'bad' } }).success).toBe(false);
  for (const endpoint of ['https://web.push.apple.com/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc']) expect(pushSubscriptionSchema.safeParse({ ...subscription('a'), endpoint }).success).toBe(true);
});
