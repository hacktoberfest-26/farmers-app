import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server/src/app';
import type { CommunityState, Profile } from '../src/lib/model';

const directory = mkdtempSync(join(tmpdir(), 'hcommunity-api-'));
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

function server(name: string) {
  const app = buildServer({ sqlitePath: join(directory, `${name}.sqlite`), corsOrigin: 'http://127.0.0.1:3000', bootstrapAdminEmail: 'admin@example.test', bootstrapAdminPassword: 'operator-secret-password' });
  apps.push(app);
  return app;
}
async function register(app: FastifyInstance, name: string, email: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, email, password: 'safe-password-123', adult: true } });
  expect(response.statusCode).toBe(201);
  return response.json() as { token: string; userId: string };
}
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
async function state(app: FastifyInstance, token?: string): Promise<CommunityState> {
  const response = await app.inject({ method: 'GET', url: '/api/community', headers: token ? headers(token) : {} });
  expect(response.statusCode).toBe(200);
  return response.json() as CommunityState;
}
async function command(app: FastifyInstance, token: string, payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/commands', headers: { ...headers(token), 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
}
async function onboard(app: FastifyInstance, token: string, sportId = 'tennis') {
  const before = await state(app, token);
  const profile = before.profiles.find(person => person.id === before.viewerId) as Profile;
  const response = await command(app, token, { type: 'profile.save', profile: { ...profile, onboarded: true, discoverable: true, sports: { [sportId]: 'beginner' } } });
  expect(response.statusCode).toBe(200);
  return profile.id;
}

test('public and pending snapshots reveal no social data; admin approval gates discovery and messaging', async () => {
  const app = server('social');
  const adminResponse = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.test', password: 'operator-secret-password' } });
  expect(adminResponse.statusCode).toBe(200);
  const admin = adminResponse.json() as { token: string; userId: string };
  const alice = await register(app, 'Alice Person', 'alice@example.test');
  const bob = await register(app, 'Bob Person', 'bob@example.test');
  expect((await state(app)).profiles).toHaveLength(0);
  expect((await state(app, alice.token)).profiles.map(person => person.id)).toEqual([alice.userId]);
  expect((await command(app, alice.token, { type: 'admin.member', userId: alice.userId, role: 'member' })).statusCode).toBe(400);
  await onboard(app, admin.token);
  await onboard(app, alice.token);
  await onboard(app, bob.token);
  expect((await command(app, admin.token, { type: 'admin.member', userId: alice.userId, role: 'member' })).statusCode).toBe(200);
  expect((await state(app, alice.token)).profiles.map(person => person.id)).not.toContain(bob.userId);
  expect((await command(app, alice.token, { type: 'connection.request', userId: bob.userId })).statusCode).toBe(400);
  expect((await command(app, admin.token, { type: 'admin.member', userId: bob.userId, role: 'member' })).statusCode).toBe(200);
  expect((await command(app, alice.token, { type: 'message.send', userId: bob.userId, body: 'Private' })).statusCode).toBe(400);
  const request = await command(app, alice.token, { type: 'connection.request', userId: bob.userId });
  expect(request.statusCode).toBe(200);
  const edge = (request.json() as CommunityState).connections.find(item => item.to === bob.userId);
  expect(edge?.status).toBe('pending');
  expect((await command(app, bob.token, { type: 'connection.respond', id: edge?.id, accept: true })).statusCode).toBe(200);
  expect((await command(app, alice.token, { type: 'message.send', userId: bob.userId, body: 'Private' })).statusCode).toBe(200);
  expect((await state(app, bob.token)).messages.map(message => message.body)).toEqual(['Private']);
  expect((await state(app)).messages).toHaveLength(0);
  expect((await command(app, bob.token, { type: 'user.block', userId: alice.userId })).statusCode).toBe(200);
  expect((await state(app, alice.token)).messages).toHaveLength(0);
  expect((await command(app, alice.token, { type: 'message.send', userId: bob.userId, body: 'Blocked' })).statusCode).toBe(400);
});

test('tokens are revocable and state persists across a server restart', async () => {
  const app = server('restart');
  const alice = await register(app, 'Alice Person', 'alice@example.test');
  expect((await state(app, alice.token)).viewerId).toBe(alice.userId);
  await app.close();
  apps.splice(apps.indexOf(app), 1);
  const restarted = server('restart');
  expect((await state(restarted, alice.token)).viewerId).toBe(alice.userId);
  const login = await restarted.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.test', password: 'safe-password-123' } });
  expect(login.statusCode).toBe(200);
  const second = (login.json() as { token: string }).token;
  expect(second).not.toBe(alice.token);
  expect((await restarted.inject({ method: 'POST', url: '/api/auth/logout', headers: headers(alice.token) })).statusCode).toBe(204);
  expect((await restarted.inject({ method: 'GET', url: '/api/community', headers: headers(alice.token) })).statusCode).toBe(401);
  expect((await state(restarted, second)).viewerId).toBe(alice.userId);
});

test('invalid commands cannot mutate state or promote their own role', async () => {
  const app = server('invalid');
  const alice = await register(app, 'Alice Person', 'alice@example.test');
  const before = await state(app, alice.token);
  const profile = before.profiles[0];
  expect((await command(app, alice.token, { type: 'profile.save', profile: { ...profile, role: 'admin' } })).statusCode).toBe(400);
  expect((await command(app, alice.token, { type: 'profile.save', profile: { ...profile, adult: false } })).statusCode).toBe(400);
  expect((await state(app, alice.token)).profiles[0]).toEqual(profile);
  expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Minor User', email: 'minor@example.test', password: 'safe-password-123', adult: false } })).statusCode).toBe(400);
});
