import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['platform', 'identity', 'orders', 'pricing', 'documents', 'payments'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://papperdash:papperdash@localhost:5432/papperdash' },
});
