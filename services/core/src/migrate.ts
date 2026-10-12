// Applies database migrations. Runs as a one-off task before each deploy.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createPool } from './platform/pool.js';

const pool = createPool({ connectionString: process.env.DATABASE_URL });
await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
await pool.end();
console.log('Migrations applied');
