import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stateSchema, type CommunityState } from '../src/lib/model';
import { createSeed } from '../src/lib/seed';
import { exportDatabase, openSQLite, readState, writeState } from '../src/lib/sqlite';

const wasm = Uint8Array.from(readFileSync(`${process.cwd()}/node_modules/sql.js/dist/sql-wasm.wasm`)).buffer;
const open = (bytes?: Uint8Array) => openSQLite(bytes, wasm);

const state = (): CommunityState => stateSchema.parse({
  version: 1, viewerId: 'alice', profiles: [], sports: [], venues: [], sessions: [], connections: [],
  messages: [], comments: [], notifications: [], announcements: [], reports: [], blocks: [], saved: [], likes: [],
  settings: { name: 'Prototype', description: '', weights: { sports: 1, availability: 1, skill: 1, community: 1, goals: 1 } },
});

describe('SQLite community snapshots', () => {
  it('round trips the full seeded prototype', async () => {
    const db = await open();
    const seed = createSeed();
    writeState(db, seed);
    const reopened = await open(exportDatabase(db));
    expect(readState(reopened)).toEqual(seed);
    reopened.close();
    db.close();
  });

  it('starts empty and survives a binary export and reopen', async () => {
    const db = await open();
    expect(readState(db)).toBeNull();
    const initial = state();
    writeState(db, { ...initial, saved: ['session-1'], blocks: [{ from: 'alice', to: 'bob' }] });
    const bytes = exportDatabase(db);
    const reopened = await open(bytes);
    expect(readState(reopened)).toEqual({ ...initial, saved: ['session-1'], blocks: [{ from: 'alice', to: 'bob' }] });
    reopened.close();
    db.close();
  });

  it('persists sign-out and deletion as complete state replacements', async () => {
    const db = await open();
    const initial = { ...state(), saved: ['old-session'], likes: ['old-session'] };
    writeState(db, initial);
    writeState(db, { ...state(), viewerId: null });
    const reopened = await open(exportDatabase(db));
    expect(readState(reopened)?.viewerId).toBeNull();
    expect(readState(reopened)?.saved).toEqual([]);
    expect(readState(reopened)?.likes).toEqual([]);
    reopened.close();
    db.close();
  });

  it('rejects corrupt records at the read boundary', async () => {
    const db = await open();
    writeState(db, state());
    db.run("UPDATE community_data SET value = '2' WHERE key = 'version'");
    expect(() => readState(db)).toThrow();
    db.close();
  });

  it('rolls back a failed write without changing the prior snapshot', async () => {
    const db = await open();
    const initial = state();
    writeState(db, initial);
    db.exec("CREATE TRIGGER stop_messages BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'blocked write'); END;");
    const changed = { ...initial, settings: { ...initial.settings, name: 'Changed' },
      messages: [{ id: 'm1', from: 'alice', to: 'bob', body: 'Hello', createdAt: '2026-10-24T12:00:00Z' }] };
    expect(() => writeState(db, changed)).toThrow();
    expect(readState(db)).toEqual(initial);
    db.close();
  });
});
