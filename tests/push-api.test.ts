import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { buildServer } from '../server/src/app';
const directory = mkdtempSync(join(tmpdir(), 'farmers-push-'));
let delivered = 0;
const app = buildServer({ sqlitePath: join(directory, 'test.sqlite'), corsOrigin: 'https://farmers.test', campus: {
  ai: null, scheduler: false, sharedDemo: { code: 'test-passcode' }, push: { publicKey: 'public-test-key', send: async () => { delivered++; } },
} });
afterAll(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
const request = (url: string, payload: unknown, token?: string) => app.inject({ method: 'POST', url, payload: JSON.stringify(payload), headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
it('protects subscription routes and isolates shared-demo persona switches and logout', async () => {
  expect((await request('/api/campus/push/status', { endpoint: null })).statusCode).toBe(401);
  const signed = await request('/api/campus/demo/sign-in', { code: 'test-passcode', alias: 'alex' });
  expect(signed.statusCode).toBe(200);
  const token = signed.json<{ token: string }>().token;
  expect((await request('/api/campus/push/status', { endpoint: null }, token)).json()).toEqual({ publicKey: 'public-test-key', enabled: false });
  expect((await request('/api/campus/push/subscribe', { subscription: { ...subscription, endpoint: 'http://localhost:8080/health' }, locale: 'en' }, token)).statusCode).toBe(400);
  expect((await request('/api/campus/push/subscribe', { subscription, locale: 'en' }, token)).json().enabled).toBe(true);
  expect((await request('/api/campus/push/test', { endpoint: subscription.endpoint }, token)).json()).toEqual({ accepted: true });
  expect(delivered).toBe(1);
  const switched = await request('/api/campus/demo/switch', { alias: 'mia' }, token);
  expect(switched.statusCode).toBe(200);
  const next = switched.json<{ token: string }>().token;
  expect((await request('/api/campus/push/status', { endpoint: subscription.endpoint }, token)).statusCode).toBe(401);
  expect((await request('/api/campus/push/status', { endpoint: subscription.endpoint }, next)).json().enabled).toBe(false);
  expect((await request('/api/campus/push/subscribe', { subscription, locale: 'it' }, next)).statusCode).toBe(200);
  expect((await request('/api/auth/logout', {}, next)).statusCode).toBe(204);
  expect((await request('/api/campus/push/status', { endpoint: subscription.endpoint }, next)).statusCode).toBe(401);
});
