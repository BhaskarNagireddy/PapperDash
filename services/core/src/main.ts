import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { createApp } from './app.js';
import { loadConfig } from './platform/config.js';

const { databaseUrl, ...config } = loadConfig();
const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
const app = await createApp({ db: drizzle(pool), config });
await app.listen(config.port);
console.log(`PapperDash core listening on :${config.port}`);
