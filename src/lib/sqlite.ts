import initSqlJs, { type Database } from 'sql.js';
import { communityConfig, stateSchema, type CommunityState } from './model';

const tables = [
  'profiles', 'sports', 'venues', 'sessions', 'connections', 'messages', 'comments',
  'notifications', 'announcements', 'reports', 'blocks', 'saved', 'likes',
] as const;
type Table = typeof tables[number];

const schema = `
  CREATE TABLE IF NOT EXISTS community_data (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  ${tables.map(table => `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL);`).join('\n')}
`;

export async function openSQLite(bytes?: Uint8Array, wasmBinary?: ArrayBuffer): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: file => `${communityConfig.basePath}/vendor/${file}`,
    wasmBinary,
  });
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.exec(schema);
  return db;
}

function rows(db: Database, table: Table): unknown[] {
  const result = db.exec(`SELECT data FROM ${table} ORDER BY rowid`);
  return result[0]?.values.map(row => JSON.parse(String(row[0]))) ?? [];
}

function value(db: Database, key: string): unknown {
  const statement = db.prepare('SELECT value FROM community_data WHERE key = ?');
  try {
    statement.bind([key]);
    return statement.step() ? JSON.parse(String(statement.get()[0])) : undefined;
  } finally {
    statement.free();
  }
}

export function readState(db: Database): CommunityState | null {
  const version = value(db, 'version');
  if (version === undefined) return null;
  const arrays = Object.fromEntries(tables.map(table => [table, rows(db, table)]));
  return stateSchema.parse({
    ...arrays,
    version,
    viewerId: value(db, 'viewerId'),
    settings: value(db, 'settings'),
  });
}

function entryId(table: Table, item: unknown): string {
  if (table === 'saved' || table === 'likes') return String(item);
  if (table === 'blocks') {
    const block = item as CommunityState['blocks'][number];
    return `${block.from}\u0000${block.to}`;
  }
  const entity = item as { id: string };
  return entity.id;
}

export function writeState(db: Database, input: CommunityState): void {
  const state = stateSchema.parse(input);
  db.exec('BEGIN');
  try {
    for (const [key, item] of Object.entries({ version: state.version, viewerId: state.viewerId, settings: state.settings })) {
      db.run('INSERT OR REPLACE INTO community_data(key,value) VALUES (?,?)', [key, JSON.stringify(item)]);
    }
    for (const table of tables) {
      db.exec(`DELETE FROM ${table}`);
      const items = state[table] as unknown[];
      for (const item of items) db.run(`INSERT INTO ${table}(id,data) VALUES (?,?)`, [entryId(table, item), JSON.stringify(item)]);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function exportDatabase(db: Database): Uint8Array {
  return db.export();
}
