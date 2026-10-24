import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
it('displays generic push content and opens the correct same-origin match view', async () => {
  type Event = { data?: { json: () => unknown }; notification?: { close: () => void; data: { tab: string } }; waitUntil: (promise: Promise<unknown>) => void };
  const listeners = new Map<string, (event: Event) => void>();
  const notifications: { title: string; options: { body: string; data: { tab: string } } }[] = [];
  const opened: string[] = []; const pending: Promise<unknown>[] = [];
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { URL, self: {
    location: { href: 'https://farmers.test/sw.js', origin: 'https://farmers.test' },
    addEventListener: (kind: string, handler: (event: Event) => void) => listeners.set(kind, handler),
    registration: { showNotification: async (title: string, options: { body: string; data: { tab: string } }) => { notifications.push({ title, options }); } },
    clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } },
  } });
  listeners.get('push')!({ data: { json: () => ({ kind: 'match', locale: 'en', name: 'Private name', url: 'https://evil.test' }) }, waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  expect(notifications[0].options.body).toContain('both said yes');
  expect(JSON.stringify(notifications)).not.toMatch(/Private name|evil.test/);
  listeners.get('notificationclick')!({ notification: { close: () => {}, data: notifications[0].options.data }, waitUntil: promise => pending.push(promise) });
  await Promise.all(pending); expect(opened).toEqual(['/?tab=connections']);
});
