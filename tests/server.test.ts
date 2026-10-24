import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildServer } from '../server/src/app';
import { stateSchema, type CommunityState, type Profile } from '../src/lib/model';

const directory = mkdtempSync(join(tmpdir(), 'hcommunity-api-test-'));
const sqlitePath = join(directory, 'community.sqlite');
const options = { sqlitePath, corsOrigin: 'https://example.test', bootstrapAdminEmail: 'admin@example.test',
  bootstrapAdminPassword: 'operator-controlled-password-2026' };
let app: ReturnType<typeof buildServer>;
const accounts: Record<string, { token: string; userId: string }> = {};

const request = async (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, token?: string) =>
  await app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async (name: string) => {
  const response = await request('POST', '/api/auth/register', {
    name, email: `${name.toLowerCase()}@example.test`, password: 'correct horse battery staple', adult: true,
  });
  expect(response.statusCode).toBe(201);
  const body = response.json<{ token: string; userId: string }>();
  expect(body.token.length).toBeGreaterThan(20);
  accounts[name] = body;
  return body;
};
const view = async (name?: string): Promise<CommunityState> => {
  const response = await request('GET', '/api/community', undefined, name ? accounts[name].token : undefined);
  expect(response.statusCode).toBe(200);
  return stateSchema.parse(response.json());
};
const command = async (name: string, body: Record<string, unknown>, status = 200) => {
  const response = await request('POST', '/api/commands', body, accounts[name].token);
  expect(response.statusCode).toBe(status);
  return response;
};
const onboard = async (name: string, changes: Partial<Profile> = {}) => {
  const state = await view(name);
  const own = state.profiles.find(person => person.id === accounts[name].userId);
  expect(own).toBeDefined();
  return command(name, { type: 'profile.save', profile: { ...own, onboarded: true, discoverable: true, ...changes } });
};

beforeAll(async () => { app = buildServer(options); await app.ready(); });
afterAll(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });

describe('Fastify SQLite API', () => {
  it('keeps public and pending snapshots private and rejects self elevation', async () => {
    const publicView = await view();
    expect(publicView.profiles).toEqual([]);
    expect(publicView.sessions).toEqual([]);
    expect(publicView.sports).toHaveLength(9);
    const claimAdmin = await request('POST', '/api/auth/register', {
      name: 'Attacker', email: 'admin@example.test', password: 'attacker-password', adult: true,
    });
    expect(claimAdmin.statusCode).toBe(409);
    const adminLogin = await request('POST', '/api/auth/login', {
      email: 'admin@example.test', password: options.bootstrapAdminPassword,
    });
    expect(adminLogin.statusCode).toBe(200);
    accounts.Admin = adminLogin.json<{ token: string; userId: string }>();
    for (const name of ['Bob', 'Carol', 'Hidden']) await register(name);
    const pending = await view('Bob');
    expect(pending.profiles.map(profile => profile.id)).toEqual([accounts.Bob.userId]);
    expect(pending.messages).toEqual([]);
    expect((await command('Bob', { type: 'profile.save', profile: {
      ...pending.profiles[0], role: 'admin', onboarded: true,
    } }, 400)).json()).toHaveProperty('error');
    await onboard('Admin');
    await onboard('Bob');
    await onboard('Carol');
    await onboard('Hidden');
    expect((await view('Bob')).profiles).toHaveLength(1);
    await command('Bob', { type: 'connection.request', userId: accounts.Carol.userId }, 400);
    for (const name of ['Bob', 'Carol', 'Hidden']) {
      await command('Admin', { type: 'admin.member', userId: accounts[name].userId, role: 'member' });
    }
    expect((await view('Bob')).profiles.length).toBeGreaterThan(1);
  });

  it('allows accepted hidden connections, then hides both ways after a block', async () => {
    await command('Bob', { type: 'connection.request', userId: accounts.Hidden.userId });
    const hiddenState = await view('Hidden');
    const edge = hiddenState.connections.find(item => item.from === accounts.Bob.userId);
    expect(edge?.status).toBe('pending');
    await command('Hidden', { type: 'connection.respond', id: edge?.id, accept: true });
    await onboard('Hidden', { discoverable: false });
    expect((await view('Bob')).profiles.some(person => person.id === accounts.Hidden.userId)).toBe(true);
    await command('Bob', { type: 'message.send', userId: accounts.Hidden.userId, body: 'Hello' });
    expect((await view('Hidden')).messages).toHaveLength(1);
    await command('Hidden', { type: 'user.block', userId: accounts.Bob.userId });
    expect((await view('Bob')).messages).toEqual([]);
    expect((await view('Hidden')).messages).toEqual([]);
    await command('Bob', { type: 'message.send', userId: accounts.Hidden.userId, body: 'Blocked' }, 400);
  });

  it('keeps saved state per user and caps session participation atomically', async () => {
    const admin = accounts.Admin.userId;
    const session = { id: 'test-session', sportId: 'tennis', organizerId: admin, title: 'Weekend tennis',
      description: '', date: new Date(Date.now() + 86_400_000).toISOString(), duration: 60,
      venueId: 'campus-court', format: 'singles', capacity: 2, skill: 'all', visibility: 'community',
      approval: false, participants: [admin], pending: [], waitlist: [], invited: [], status: 'open',
      booking: 'not-booked', createdAt: new Date().toISOString() };
    await command('Admin', { type: 'session.create', session });
    await command('Bob', { type: 'saved.toggle', id: session.id });
    await command('Bob', { type: 'like.toggle', id: session.id });
    expect((await view('Bob')).saved).toEqual([session.id]);
    expect((await view('Carol')).saved).toEqual([]);
    expect((await view('Carol')).likes).toEqual([]);
    await command('Bob', { type: 'session.join', id: session.id });
    await command('Bob', { type: 'session.join', id: session.id });
    await command('Carol', { type: 'session.join', id: session.id });
    const result = (await view('Admin')).sessions.find(item => item.id === session.id);
    expect(result?.participants).toHaveLength(2);
    expect(result?.waitlist).toContain(accounts.Carol.userId);
  });

  it('handles login, logout, token expiry, and persistence across restart', async () => {
    const wrong = await request('POST', '/api/auth/login', { email: 'bob@example.test', password: 'wrong password' });
    expect(wrong.statusCode).toBe(401);
    const login = await request('POST', '/api/auth/login', {
      email: 'bob@example.test', password: 'correct horse battery staple',
    });
    expect(login.statusCode).toBe(200);
    const freshToken = login.json<{ token: string }>().token;
    const logout = await request('POST', '/api/auth/logout', undefined, freshToken);
    expect(logout.statusCode).toBe(204);
    expect((await request('GET', '/api/community', undefined, freshToken)).statusCode).toBe(401);

    const db = new DatabaseSync(sqlitePath);
    const tokenHash = createHash('sha256').update(accounts.Bob.token).digest('hex');
    db.prepare('UPDATE auth_sessions SET expires_at=0 WHERE token_hash=?').run(tokenHash);
    db.close();
    expect((await request('GET', '/api/community', undefined, accounts.Bob.token)).statusCode).toBe(401);

    await app.close();
    app = buildServer(options);
    await app.ready();
    const restored = await view('Admin');
    expect(restored.sessions.some(session => session.id === 'test-session')).toBe(true);
    const loginAfterRestart = await request('POST', '/api/auth/login', {
      email: 'bob@example.test', password: 'correct horse battery staple',
    });
    expect(loginAfterRestart.statusCode).toBe(200);
    const restoredToken = loginAfterRestart.json<{ token: string }>().token;
    const exported = await request('GET', '/api/export', undefined, restoredToken);
    expect(exported.statusCode).toBe(200);
    expect(exported.payload).not.toContain('password_hash');
    expect(exported.payload).not.toContain('token_hash');
    const deleted = await request('POST', '/api/commands', { type: 'account.delete' }, restoredToken);
    expect(deleted.statusCode).toBe(200);
    expect((await request('GET', '/api/community', undefined, restoredToken)).statusCode).toBe(401);
  });
});
