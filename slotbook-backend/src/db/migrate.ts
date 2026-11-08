import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const sqlPath = path.resolve(__dirname, '../../drizzle/0000_init.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
  await pool.query(sqlContent);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async () => {
      console.log('Migrations applied successfully.');
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await pool.end();
      process.exit(1);
    });
}
