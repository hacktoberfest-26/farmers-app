import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { buildServer } from './app';
import { campusConfiguration } from './campus-config';

const production = process.env.NODE_ENV === 'production';
const host = process.env.API_HOST ?? (production ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT ?? 8080);
const sqlitePath = process.env.SQLITE_PATH ?? resolve(process.cwd(), 'data/hcommunity.sqlite');
const corsOrigin = process.env.CORS_ORIGIN ?? (production ? '' : 'http://127.0.0.1:3000');
const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
const bootstrapAdminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const demoData = process.env.USE_DEMO_DATA === 'true';

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
if (production) {
  if (!isAbsolute(sqlitePath)) throw new Error('Production SQLITE_PATH must be absolute');
  if (!bootstrapAdminEmail?.trim() || !bootstrapAdminPassword || bootstrapAdminPassword.length < 16) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a 16-character BOOTSTRAP_ADMIN_PASSWORD in production');
  }
  if (demoData) throw new Error('USE_DEMO_DATA is not permitted in production');
  const parsed = new URL(corsOrigin);
  if (parsed.protocol !== 'https:' || parsed.origin !== corsOrigin) throw new Error('CORS_ORIGIN must be one exact HTTPS origin');
}
mkdirSync(dirname(sqlitePath), { recursive: true });
let cleanupFailures=0;
const campus=campusConfiguration(process.env,()=>{cleanupFailures++;app.log.warn({category:'backboard_cleanup_failed',count:cleanupFailures},'Temporary AI conversation cleanup failed');});
const app = buildServer({ sqlitePath, corsOrigin, bootstrapAdminEmail, bootstrapAdminPassword, demoData, campus });
const close = async () => { await app.close(); process.exit(0); };
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
await app.listen({ host, port });
