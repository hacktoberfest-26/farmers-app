import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CampusService } from '../server/src/campus-service';
import { initialCampusProfile, type CampusMember, type CampusProfileInput } from '../src/lib/campus-model';
import type { CampusAI } from '../server/src/backboard';
import type { AnonymousPair } from '../packages/anonymiser';

const databases: DatabaseSync[] = [];
const directories: string[] = [];
const auth = { emailEnabled: false, domains: ['campus.example'] };
const good = { score: 90, reasonCodes: ['shared_interests', 'shared_goal'] } satisfies Awaited<ReturnType<CampusAI['score']>>;
const makeAI = (score: CampusAI['score'] = async () => good): CampusAI => ({
  model: 'gemma-test', score, normalise: async () => null, readPoster: async () => { throw new Error('Not used'); },
});

function fixture(options: { ai?: CampusAI | null; path?: string; sharedDemo?: boolean } = {}) {
  const db = new DatabaseSync(options.path ?? ':memory:');
  databases.push(db);
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS auth_users(id TEXT PRIMARY KEY);');
  let now = Date.parse('2026-10-24T08:00:00Z');
  const service = new CampusService(db, { ai: options.ai === undefined ? makeAI() : options.ai,
    auth: { ...auth, sharedDemo: options.sharedDemo === true }, now: () => now });
  const add = (id: string, change: Partial<CampusProfileInput> = {}, identity: Partial<Pick<CampusMember, 'role' | 'verification'>> = {}) => {
    db.prepare('INSERT OR IGNORE INTO auth_users(id) VALUES(?)').run(id);
    service.ensureMember({ id, email: `${id}@campus.example`, name: `Private ${id}`, role: 'student', verification: 'email', ...identity });
    const profile = { ...initialCampusProfile(`Private ${id}`), course: `Course ${id}`, privateIdea: `SECRET IDEA ${id}`,
      lookingFor: ['cofounder'], consent: { matching: true, hostedAi: true, events: false, resources: false }, ...change } satisfies CampusProfileInput;
    service.saveProfile(id, profile);
    return profile;
  };
  return { db, service, add, advance: (milliseconds: number) => { now += milliseconds; } };
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('private campus lifecycle', () => {
  it('sends only category features to AI and reveals identity after two independent yeses', async () => {
    const inputs: AnonymousPair[] = [];
    const { service, add, advance } = fixture({ ai: makeAI(async input => { inputs.push(input); return good; }) });
    add('a'); add('b'); add('outsider', { lookingFor: ['events'] });
    expect((await service.runEngine()).published).toBe(1);
    const card = service.home('a').suggestions[0];
    expect(card?.kind).toBe('anonymous');
    const anonymous = JSON.stringify(service.home('a').suggestions);
    for (const privateValue of ['Private b', 'Course b', 'b@campus.example', 'SECRET IDEA']) expect(anonymous).not.toContain(privateValue);
    expect(JSON.stringify(inputs)).not.toMatch(/SECRET|Private|campus\.example|"id"|"course"/);
    expect(service.home('a').me?.profile.privateIdea).toBe('SECRET IDEA a');
    if (!card) throw new Error('Missing card');
    expect(() => service.answer('outsider', card.id, 'yes')).toThrow('Suggestion unavailable');
    expect(service.answer('a', card.id, 'yes').suggestions[0]?.kind).toBe('anonymous');
    const partnerView = service.home('b').suggestions[0];
    expect(partnerView?.kind === 'anonymous' && partnerView.myAnswer).toBe('pending');
    service.answer('b', card.id, 'yes');
    const revealed = service.home('a').suggestions[0];
    expect(revealed?.kind === 'revealed' && revealed.person.name).toBe('Private b');
    expect(service.answer('a', card.id, 'yes').suggestions[0]?.kind).toBe('revealed');
    expect(() => service.answer('a', card.id, 'no')).toThrow('Answer already recorded');
    expect((await service.runEngine()).published).toBe(0);
    advance(73 * 60 * 60_000);
    expect(service.home('a').suggestions[0]?.kind).toBe('revealed');
    expect(service.home(null).suggestions).toEqual([]);
  });

  it('closes refusals and expiry silently and never offers the same pair again', async () => {
    const { service, add, advance } = fixture();
    add('a'); add('b');
    await service.runEngine();
    const card = service.home('a').suggestions[0];
    if (!card) throw new Error('Missing card');
    service.answer('a', card.id, 'no');
    expect(service.home('a').suggestions).toEqual([]);
    expect(service.home('b').suggestions).toEqual([]);
    expect(() => service.answer('b', card.id, 'yes')).toThrow('Suggestion unavailable');
    expect(service.answer('a', card.id, 'no').suggestions).toEqual([]);
    expect((await service.runEngine()).scored).toBe(0);
    add('c');
    await service.runEngine();
    advance(73 * 60 * 60_000);
    expect(service.home('c').suggestions).toEqual([]);
  });

  it('retains the subject daily cap when counterparts are deleted', async () => {
    const { service, db, add, advance } = fixture();
    add('a'); for (const id of ['b', 'c', 'd']) add(id);
    await service.runEngine();
    expect(service.home('a').suggestions).toHaveLength(3);
    for (const id of ['b', 'c', 'd']) db.prepare('DELETE FROM auth_users WHERE id=?').run(id);
    expect(service.home('a').suggestions).toEqual([]);
    add('e');
    expect((await service.runEngine()).published).toBe(0);
    advance(24 * 60 * 60_000);
    expect((await service.runEngine()).published).toBe(1);
  });

  it('holds a durable singleton lease without keeping a SQLite transaction across AI', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const { service, db, add } = fixture({ ai: makeAI(async () => { await pending; return good; }) });
    add('a'); const profile = add('b');
    const running = service.runEngine();
    const other = new CampusService(db, { ai: makeAI(), auth, now: () => Date.parse('2026-10-24T08:00:00Z') });
    expect((await other.runEngine()).status).toBe('busy');
    service.saveProfile('b', { ...profile, consent: { ...profile.consent, matching: false } });
    release?.();
    expect((await running).published).toBe(0);
    expect(service.home('a').suggestions).toEqual([]);
    expect(service.home('a').agent.status).toBe('ready');
  });

  it('does not fake AI results and releases the lease after failures', async () => {
    const { service, add, advance } = fixture({ ai: makeAI(async () => { throw new Error('provider secret'); }) });
    add('a'); add('b');
    expect((await service.runEngine()).published).toBe(0);
    expect(service.home('a').agent.status).toBe('error');
    expect(JSON.stringify(service.home('a'))).not.toContain('provider secret');
    advance(61_000);
    expect((await service.runEngine()).status).toBe('completed');
    const unavailable = fixture({ ai: null });
    expect((await unavailable.service.runEngine()).status).toBe('unavailable');
  });

  it('excludes unverified or incomplete accounts and upgrades only explicit verified membership', async () => {
    const { service, db, add } = fixture();
    add('a'); const profile = add('b');
    service.deleteSelf('b');
    service.ensureMember({ id: 'b', email: 'b@campus.example', name: 'Unverified b', role: 'student', verification: 'unverified' });
    service.saveProfile('b', profile);
    expect((await service.runEngine()).scored).toBe(0);
    service.ensureMember({ id: 'b', email: 'b@campus.example', name: 'Verified b', role: 'student', verification: 'email' });
    expect((await service.runEngine()).published).toBe(1);
    db.prepare('INSERT INTO auth_users(id) VALUES(?)').run('incomplete');
    service.ensureMember({ id: 'incomplete', email: 'incomplete@campus.example', name: 'Incomplete', role: 'student', verification: 'operator' });
    expect((await service.runEngine()).scored).toBe(0);
  });

  it('matches sports only with the same level and a shared day and slot', async () => {
    const { service, add } = fixture();
    const sport = { sport: 'tennis', level: 'beginner', days: [1], slots: ['morning'] } satisfies CampusProfileInput['sports'][number];
    add('a', { lookingFor: ['sport'], sports: [sport] });
    add('b', { lookingFor: ['sport'], sports: [{ ...sport, level: 'advanced' }] });
    add('c', { lookingFor: ['sport'], sports: [{ ...sport, days: [2] }] });
    add('d', { lookingFor: ['sport'], sports: [sport] });
    expect((await service.runEngine()).published).toBe(1);
    expect(service.home('a').suggestions[0]?.matchType).toBe('sport');
    expect(service.home('b').suggestions).toEqual([]);
  });

  it('drops model reasons unsupported by the actual facts and rejects a card with no supported reason', async () => {
    const { service, add } = fixture({ ai: makeAI(async () => ({ score: 95, reasonCodes: ['same_sport', 'shared_goal'] })) });
    add('a'); add('b');
    await service.runEngine();
    expect(service.home('a').suggestions[0]?.reasons).toEqual(['shared_goal']);
    const invalid = fixture({ ai: makeAI(async () => ({ score: 95, reasonCodes: ['complementary_skills'] })) });
    invalid.add('a'); invalid.add('b');
    expect((await invalid.service.runEngine()).published).toBe(0);
  });

  it('bounds model calls per run and persists the daily paid-inference budget', async () => {
    const { service, add, advance } = fixture({ ai: makeAI(async () => ({ score: 10, reasonCodes: ['shared_goal'] })) });
    for (let i = 0; i < 12; i++) add(`user-${i}`);
    expect((await service.runEngine()).scored).toBe(12);
    expect((await service.runEngine()).scored).toBe(12);
    expect((await service.runEngine()).scored).toBe(6);
    expect((await service.runEngine()).scored).toBe(0);
    advance(24 * 60 * 60_000);
    expect((await service.runEngine()).scored).toBe(12);
  });

  it('requires verification and consent, preserves verification, and revokes existing reveals on withdrawal', async () => {
    const { service, add } = fixture();
    add('a'); const profile = add('b');
    service.ensureMember({ id: 'a', email: 'a@campus.example', name: 'Changed', role: 'student', verification: 'unverified' });
    expect(service.member('a')?.verification).toBe('email');
    await service.runEngine();
    const card = service.home('a').suggestions[0];
    if (!card) throw new Error('Missing card');
    service.answer('a', card.id, 'yes'); service.answer('b', card.id, 'yes');
    service.saveProfile('b', { ...profile, consent: { ...profile.consent, hostedAi: false } });
    expect(service.home('a').suggestions).toEqual([]);
    service.saveProfile('b', profile);
    expect(service.home('a').suggestions).toEqual([]);
  });

  it('survives reopening SQLite and only exposes own private export', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'farmers-campus-')); directories.push(directory);
    const path = join(directory, 'campus.sqlite');
    const first = fixture({ path });
    first.add('a'); first.add('b'); await first.service.runEngine();
    const second = fixture({ path });
    expect(second.service.home('a').suggestions).toHaveLength(1);
    const data = JSON.stringify(second.service.exportSelf('a'));
    expect(data).toContain('SECRET IDEA a');
    expect(data).not.toContain('SECRET IDEA b');
    second.service.deleteSelf('b');
    expect(first.service.home('a').suggestions).toEqual([]);
  });

  it('uses real AI for shared fictional proposals while isolating live accounts and run scopes', async () => {
    let calls = 0;
    const { service, add } = fixture({ sharedDemo: true, ai: makeAI(async () => { calls++; return good; }) });
    add('live-a'); add('live-b');
    add('demo-a', {}, { verification: 'demo' }); add('demo-b', {}, { verification: 'demo' });
    expect((await service.runEngine('demo')).published).toBe(1);
    expect(service.home('live-a').suggestions).toEqual([]);
    expect(service.home('demo-a').demo).toBe(true);
    expect(service.home('demo-a').agent.configured).toBe(true);
    expect(service.home('demo-a').agent.model).toBe('gemma-test');
    expect(service.home('live-a').demo).toBe(false);
    expect((await service.runEngine('live')).published).toBe(1);
    expect((await service.runEngine()).published).toBe(0);
    expect(calls).toBe(2);
  });

  it('isolates fictional events and alerts and prevents cross-workspace event replacement', () => {
    const { service, add } = fixture({ sharedDemo: true });
    const enabled = { consent: { matching: true, hostedAi: true, events: true, resources: false } };
    add('operator', enabled, { role: 'admin', verification: 'operator' });
    add('demo-staff', enabled, { role: 'staff', verification: 'demo' });
    add('live-student', enabled);
    add('demo-student', enabled, { verification: 'demo' });
    const event = { id: 'live-event', title: 'Campus talk', date: '2026-10-25T12:00:00Z', place: 'Campus', topics: ['technology'], source: 'manual' } satisfies Parameters<CampusService['addEvent']>[1];
    service.addEvent('operator', event);
    service.addEvent('demo-staff', { ...event, id: 'demo-event', title: 'Fictional demo talk', source: 'poster' });
    expect(service.home('live-student').events.map(value => value.id)).toEqual(['live-event']);
    expect(service.home('demo-student').events.map(value => value.id)).toEqual(['demo-event']);
    expect(service.home('demo-student').events[0]?.source).toBe('demo');
    expect(service.home('demo-staff').alerts[0]?.title).toContain('Fictional demo');
    expect(service.home('operator').alerts).toEqual([]);
    expect(() => service.addEvent('demo-staff', event)).toThrow('another campus workspace');
    expect(() => service.addEvent('operator', { ...event, source: 'demo' })).toThrow('fictional demo staff');
  });

  it('lets only the real operator reset demo decisions, preserving profiles, live data and paid budget', async () => {
    const { service, add, db } = fixture({ sharedDemo: true });
    add('operator', { lookingFor: ['events'] }, { role: 'admin', verification: 'operator' });
    add('live-a'); add('live-b');
    add('demo-a', {}, { verification: 'demo', role: 'admin' }); add('demo-b', {}, { verification: 'demo' });
    await service.runEngine('demo'); await service.runEngine('live');
    const card = service.home('demo-a').suggestions[0];
    if (!card) throw new Error('Missing demo card');
    service.answer('demo-a', card.id, 'yes'); service.answer('demo-b', card.id, 'yes');
    const beforeProfile = service.member('demo-a');
    const beforeLive = service.home('live-a');
    const beforeBudget = db.prepare('SELECT * FROM campus_inference_days ORDER BY campus_day').all();
    expect(() => service.resetDemo('demo-a')).toThrow('Deployment operator');
    expect(() => service.resetDemo('live-a')).toThrow('Deployment operator');
    service.resetDemo('operator');
    expect(service.home('demo-a').suggestions).toEqual([]);
    expect(service.member('demo-a')).toEqual(beforeProfile);
    expect(service.home('live-a').suggestions).toEqual(beforeLive.suggestions);
    expect(db.prepare('SELECT * FROM campus_inference_days ORDER BY campus_day').all()).toEqual(beforeBudget);
    expect((await service.runEngine('demo')).published).toBe(1);
  });

  it('fences in-flight demo inference during reset without deleting fictional accounts', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const { service, add } = fixture({ sharedDemo: true, ai: makeAI(async () => { await pending; return good; }) });
    add('operator', { lookingFor: ['events'] }, { role: 'admin', verification: 'operator' });
    for (const id of ['demo-a', 'demo-b', 'demo-c']) add(id, {}, { verification: 'demo' });
    const running = service.runEngine('demo');
    service.resetDemo('operator');
    release?.();
    expect(await running).toMatchObject({ scored: 1, published: 0 });
    expect(service.member('demo-a')).not.toBeNull();
    expect(service.home('demo-a').suggestions).toEqual([]);
    expect((await service.runEngine('demo')).published).toBeGreaterThan(0);
  });

  it('retains a separate 100-call demo allowance alongside the 30-call live allowance', async () => {
    let calls = 0;
    const { service, add } = fixture({ sharedDemo: true, ai: makeAI(async () => { calls++; return { score: 10, reasonCodes: ['shared_goal'] }; }) });
    for (let i = 0; i < 16; i++) add(`demo-${i}`, {}, { verification: 'demo' });
    add('live-a'); add('live-b');
    for (let i = 0; i < 10; i++) await service.runEngine('demo');
    expect(calls).toBe(100);
    expect((await service.runEngine('demo')).scored).toBe(0);
    expect((await service.runEngine('live')).scored).toBe(1);
    expect(calls).toBe(101);
  });

  it('stops retained demo seeds and hides proposals when shared demo is disabled', async () => {
    const { service, add, db } = fixture({ sharedDemo: true });
    add('demo-a', {}, { verification: 'demo' }); add('demo-b', {}, { verification: 'demo' });
    await service.runEngine('demo');
    expect(service.home('demo-a').suggestions).toHaveLength(1);
    const disabled = new CampusService(db, { ai: makeAI(), auth, now: () => Date.parse('2026-10-24T08:00:00Z') });
    expect(disabled.home('demo-a').suggestions).toEqual([]);
    expect(await disabled.runEngine('demo')).toMatchObject({ scanned: 0, scored: 0, published: 0 });
    expect(await disabled.runEngine()).toMatchObject({ scanned: 0, scored: 0, published: 0 });
  });

  it('recovers an interrupted single-instance run on process startup without a ten-minute wait', async () => {
    const { service, add, db }=fixture();
    add('a');add('b');
    const future=Date.parse('2030-01-01T00:00:00Z');
    db.prepare('UPDATE campus_engine_lease SET owner=?,lease_until=? WHERE id=1').run('stopped-process',future);
    db.prepare('INSERT INTO campus_jobs(pair_key,a,b,status,attempts,lease_until,owner) VALUES(?,?,?,?,?,?,?)')
      .run(JSON.stringify(['a','b','cofounder']),'a','b','running',1,future,'stopped-process');
    expect((await service.runEngine()).status).toBe('busy');
    service.recoverInterruptedRun();
    expect((await service.runEngine()).published).toBe(1);
  });
});
