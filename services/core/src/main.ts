import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { createApp } from './app.js';
import { loadConfig } from './platform/config.js';
import { LogEmailProvider, SesEmailProvider } from './platform/email.js';

const { databaseUrl, ...config } = loadConfig();
const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
const email = config.email ? SesEmailProvider.create(config.email) : new LogEmailProvider();
const app = await createApp({ db: drizzle(pool), config, email });
await app.listen(config.port);
console.log(`PapperDash core listening on :${config.port}`);
