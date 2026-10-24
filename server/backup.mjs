import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const sourcePath = resolve(process.env.SQLITE_PATH || '/data/hcommunity.sqlite');
const targetPath = process.argv[2] ? resolve(process.argv[2]) : '';
if (!targetPath || targetPath === sourcePath) {
  throw new Error('Pass a backup destination path different from SQLITE_PATH.');
}
await access(sourcePath);
await mkdir(dirname(targetPath), { recursive: true });
let destinationExists = false;
try {
  await access(targetPath);
  destinationExists = true;
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}
if (destinationExists) throw new Error(`Backup destination already exists: ${targetPath}`);
const database = new DatabaseSync(sourcePath);
try {
  await backup(database, targetPath);
  process.stdout.write(`SQLite backup created at ${targetPath}\n`);
} finally {
  database.close();
}
