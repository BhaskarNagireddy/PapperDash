import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';

// Blocks type queries against their own table objects; the database handle itself is schema-agnostic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<PgQueryResultHKT, any, ExtractTablesWithRelations<any>>;
/** Either a database handle or an open transaction. */
export type DbOrTx = Db | Tx;

export const DB = Symbol('DB');
