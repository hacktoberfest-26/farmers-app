import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { stateSchema, type CommunityState, type Command } from '../../src/lib/model';
import { applyCommand } from '../../src/lib/policy';
import { createSeed } from '../../src/lib/seed';

export type Preferences = { saved: string[]; likes: string[]; notifications: CommunityState['notifications'] };
const emptyPreferences = (): Preferences => ({ saved: [], likes: [], notifications: [] });
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class CommunityStore {
  readonly db: DatabaseSync;
  constructor(path: string, demoData = false) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        salt TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
        saved TEXT NOT NULL DEFAULT '[]', likes TEXT NOT NULL DEFAULT '[]', notifications TEXT NOT NULL DEFAULT '[]'
      );
    `);
    const columns = this.db.prepare('PRAGMA table_info(auth_users)').all().map(row => z.object({name:z.string()}).parse(row).name);
    if (!columns.includes('password_enabled')) this.db.exec('ALTER TABLE auth_users ADD COLUMN password_enabled INTEGER NOT NULL DEFAULT 1 CHECK(password_enabled IN(0,1))');
    if (!this.db.prepare('SELECT 1 FROM state WHERE id=1').get()) {
      const seed = createSeed();
      const initial: CommunityState = demoData ? { ...seed, viewerId: null } : {
        ...seed, viewerId: null, profiles: [], sessions: [], connections: [], messages: [], comments: [],
        notifications: [], reports: [], blocks: [], saved: [], likes: [],
        announcements: [{ id: 'welcome', title: 'Welcome to Farmers', body: 'Explore sports and connect with your community after approval. Venue details are examples and must be verified before visiting.', createdAt: new Date().toISOString() }],
        settings: { ...seed.settings, name: 'Farmers', description: 'A campus sports community.' },
      };
      this.writeState(initial);
    }
  }

  close() { this.db.close(); }
  readState(): CommunityState {
    const row = this.db.prepare('SELECT data FROM state WHERE id=1').get() as { data: string } | undefined;
    if (!row) throw new Error('Community state missing');
    return stateSchema.parse(JSON.parse(row.data));
  }
  private writeState(state: CommunityState) {
    this.db.prepare('INSERT INTO state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(JSON.stringify(stateSchema.parse({ ...state, viewerId: null, saved: [], likes: [], notifications: [] })));
  }
  preferences(userId: string): Preferences {
    const row = this.db.prepare('SELECT saved,likes,notifications FROM user_preferences WHERE user_id=?').get(userId) as
      { saved: string; likes: string; notifications: string } | undefined;
    return row ? { saved: JSON.parse(row.saved), likes: JSON.parse(row.likes), notifications: JSON.parse(row.notifications) } : emptyPreferences();
  }
  private savePreferences(userId: string, value: Preferences) {
    this.db.prepare(`INSERT INTO user_preferences(user_id,saved,likes,notifications) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET saved=excluded.saved,likes=excluded.likes,notifications=excluded.notifications`)
      .run(userId, JSON.stringify(value.saved), JSON.stringify(value.likes), JSON.stringify(value.notifications));
  }
  userByEmail(email: string) {
    const row=this.db.prepare('SELECT id,email,password_hash,salt,password_enabled FROM auth_users WHERE email=?').get(email);
    return row?z.object({id:z.string(),email:z.string(),password_hash:z.string(),salt:z.string(),password_enabled:z.number()}).parse(row):undefined;
  }
  userById(id:string) {
    const row=this.db.prepare('SELECT id,email FROM auth_users WHERE id=?').get(id);
    return row?z.object({id:z.string(),email:z.string()}).parse(row):undefined;
  }
  createOtpUser(email:string, seededId?:string):{id:string;email:string} {
    const existing=this.userByEmail(email);
    if(existing)return {id:existing.id,email:existing.email};
    const id=seededId??randomBytes(24).toString('base64url');
    this.db.prepare('INSERT INTO auth_users(id,email,password_hash,salt,created_at,password_enabled) VALUES(?,?,?,?,?,0)')
      .run(id,email,randomBytes(64).toString('hex'),randomBytes(32).toString('hex'),Date.now());
    return {id,email};
  }
  deleteAccount(id:string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state=this.readState();
      this.writeState({...state,profiles:state.profiles.filter(person=>person.id!==id),sessions:state.sessions.filter(session=>session.organizerId!==id),connections:state.connections.filter(edge=>edge.from!==id&&edge.to!==id),messages:state.messages.filter(message=>message.from!==id&&message.to!==id),comments:state.comments.filter(comment=>comment.authorId!==id),blocks:state.blocks.filter(edge=>edge.from!==id&&edge.to!==id),reports:state.reports.filter(report=>report.reporterId!==id&&report.targetId!==id)});
      this.db.prepare('DELETE FROM auth_users WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  insertUser(user: { id: string; email: string; passwordHash: string; salt: string; name: string; admin: boolean }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO auth_users(id,email,password_hash,salt,created_at) VALUES(?,?,?,?,?)')
        .run(user.id, user.email, user.passwordHash, user.salt, Date.now());
      const state = this.readState();
      state.profiles.push({
        id: user.id, name: user.name, bio: '', area: '', avatar: '', color: '#55766b', sports: {}, favorites: [],
        availability: [], exceptions: [], goals: [], discoverable: false, role: user.admin ? 'admin' : 'pending',
        adult: true, onboarded: false, locale: 'en', timezone: 'Europe/Rome',
      });
      this.writeState(state);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  createSession(userId: string, durationMs=30 * 24 * 60 * 60 * 1000): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
      .run(hashToken(token), userId, Date.now() + durationMs);
    return token;
  }
  sessionUser(token: string): string | null {
    if (token.length < 20 || token.length > 200) return null;
    const row = this.db.prepare('SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at>?')
      .get(hashToken(token), Date.now()) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }
  revokeSession(token: string) { this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hashToken(token)); }
  execute(userId: string, command: Command): CommunityState {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const base = this.readState();
      const prefs = this.preferences(userId);
      const context = { ...base, viewerId: userId, ...prefs };
      const result = applyCommand(context, command);
      this.writeState(result);
      if (command.type === 'account.delete') this.db.prepare('DELETE FROM auth_users WHERE id=?').run(userId);
      else this.savePreferences(userId, { saved: result.saved, likes: result.likes, notifications: result.notifications });
      this.db.exec('COMMIT');
      return this.readState();
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
