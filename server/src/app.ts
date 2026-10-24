import { randomUUID, scrypt as scryptCallback, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { commandSchema } from '../../src/lib/model';
import { CommunityStore } from './store';
import { projectState } from './project';
import { registerCampusRoutes, type CampusOptions } from './campus-routes';
import { campusSafeLegacy, targetsCampus } from './campus-legacy';

const scrypt = promisify(scryptCallback);
const registerSchema = z.object({
  name: z.string().trim().min(2).max(60), email: z.email().transform(value => value.trim().toLowerCase()),
  password: z.string().min(8).max(128), adult: z.literal(true),
});
const loginSchema = z.object({ email: z.email().transform(value => value.trim().toLowerCase()), password: z.string() });
const bearer = (request: FastifyRequest): string | null => {
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.authorization ?? '');
  return match?.[1] ?? null;
};
const hashPassword = async (password: string, salt: string) => (await scrypt(password, salt, 64) as Buffer).toString('hex');
const verifyPassword = async (password: string, salt: string, expected: string) => {
  const candidate = Buffer.from(await hashPassword(password, salt), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
};

export type ServerOptions = { sqlitePath: string; corsOrigin: string; bootstrapAdminEmail?: string; bootstrapAdminPassword?: string; demoData?: boolean; campus?:CampusOptions };

export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', trustProxy: (_address, hop) => hop === 0, bodyLimit: 64 * 1024 });
  const store = new CommunityStore(options.sqlitePath, options.demoData ?? false);
  if (options.bootstrapAdminEmail || options.bootstrapAdminPassword) {
    if (!options.bootstrapAdminEmail || !options.bootstrapAdminPassword || options.bootstrapAdminPassword.length < 16) {
      throw new Error('Bootstrap admin requires an email and password of at least 16 characters');
    }
    const email = options.bootstrapAdminEmail.trim().toLowerCase();
    const existing = store.userByEmail(email);
    if (existing) {
      if (store.readState().profiles.find(person => person.id === existing.id)?.role !== 'admin') {
        throw new Error('Bootstrap email belongs to a non-admin account');
      }
    } else {
      const salt = randomBytes(32).toString('hex');
      store.insertUser({ id: randomUUID(), name: 'Community Admin', email, salt,
        passwordHash: scryptSync(options.bootstrapAdminPassword, salt, 64).toString('hex'), admin: true });
    }
  }
  app.register(cors, { origin: options.corsOrigin, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] });
  app.register(helmet);
  app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });
  app.addHook('onClose', async () => store.close());
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const cause = error as Error & { statusCode?: number };
    const status = cause.statusCode && cause.statusCode >= 400 && cause.statusCode < 500 ? cause.statusCode : 500;
    void reply.code(status).send({ error: status === 500 ? 'Internal server error' : cause.message });
  });
  const userId = (request: FastifyRequest): string | null => {
    const token = bearer(request);
    return token ? store.sessionUser(token) : null;
  };
  registerCampusRoutes(app,store,userId,options.campus??{ai:null,scheduler:false});
  const campusIds=()=>new Set(store.db.prepare('SELECT user_id FROM campus_members').all().map(row=>z.object({user_id:z.string()}).parse(row).user_id));
  const legacyState=()=>campusSafeLegacy(store.readState(),campusIds());

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/community', async (request, reply) => {
    const id = userId(request);
    if (request.headers.authorization && !id) return reply.code(401).send({ error: 'Invalid session' });
    return projectState(legacyState(), id, id ? store.preferences(id) : { saved: [], likes: [], notifications: [] });
  });
  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter a name, valid email, password of at least 8 characters, and adult confirmation' });
    const { name, email, password } = parsed.data;
    if (store.userByEmail(email)) return reply.code(409).send({ error: 'Account already exists' });
    const id = randomUUID();
    const salt = randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(password, salt);
    try {
      store.insertUser({ id, name, email, salt, passwordHash, admin: false });
    } catch (error) {
      if (String(error).includes('UNIQUE constraint')) return reply.code(409).send({ error: 'Account already exists' });
      throw error;
    }
    return reply.code(201).send({ token: store.createSession(id), userId: id });
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid login' });
    const account = store.userByEmail(parsed.data.email);
    const valid = await verifyPassword(parsed.data.password, account?.salt ?? 'missing-account-salt', account?.password_hash ?? '0'.repeat(128));
    if (!account || !valid || !account.password_enabled) return reply.code(401).send({ error: 'Invalid login' });
    return { token: store.createSession(account.id), userId: account.id };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const token = bearer(request);
    if (!token || !store.sessionUser(token)) return reply.code(401).send({ error: 'Invalid session' });
    store.revokeSession(token);
    return reply.code(204).send();
  });
  app.post('/api/commands', async (request, reply) => {
    const id = userId(request);
    if (!id) return reply.code(401).send({ error: 'Sign in required' });
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid command' });
    const ids=campusIds();
    if(ids.has(id)||targetsCampus(parsed.data,store.readState(),ids))return reply.code(403).send({error:'Use the campus agent for this account'});
    try {
      const state = store.execute(id, parsed.data);
      return projectState(campusSafeLegacy(state,ids), id, store.preferences(id));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Command failed' });
    }
  });
  app.get('/api/export', async (request, reply) => {
    const id = userId(request);
    if (!id) return reply.code(401).send({ error: 'Sign in required' });
    if(campusIds().has(id))return reply.code(403).send({error:'Use the campus export for this account'});
    const state = projectState(legacyState(), id, store.preferences(id));
    return { profile: state.profiles.find(person => person.id === id),
      connections: state.connections, messages: state.messages,
      sessions: state.sessions.filter(session => session.organizerId === id || session.participants.includes(id) || session.pending.includes(id) || session.waitlist.includes(id)),
      comments: state.comments.filter(comment => comment.authorId === id),
      reports: state.reports.filter(report => report.reporterId === id),
      notifications: state.notifications, saved: state.saved, likes: state.likes, blocks: state.blocks };
  });
  return app;
}
