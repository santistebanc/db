import { Effect, Context, Layer, Schedule } from "effect";
import { Pool } from "pg";
import * as dns from "dns/promises";

export interface Node {
  id: string;
  label: string;
  data: Record<string, any>;
  tags: string[];
  created_at: Date;
}

export class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly message: string, readonly cause?: unknown) { }
}

let pool: Pool | null = null;
let resolvedConnectionString: string | null = null;

const resolveWithRetry = async (hostname: string): Promise<string> => {
  const targets = [hostname, "db-postgres-1", "127.0.0.1"];
  for (const target of targets) {
    try {
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(target)) return target;
      console.log(`[Database] Resolving: ${target}`);
      const addresses = await dns.resolve4(target);
      if (addresses && addresses.length > 0) {
        console.log(`[Database] Success: ${target} -> ${addresses[0]}`);
        return addresses[0];
      }
    } catch (e) {
      console.warn(`[Database] Lookup failed for ${target}: ${String(e)}`);
    }
  }
  return hostname;
};

const getPool = async (connectionString: string): Promise<Pool> => {
  if (!pool) {
    if (!resolvedConnectionString) {
      try {
        const url = new URL(connectionString);
        if (url.hostname !== 'localhost' && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)) {
          url.hostname = await resolveWithRetry(url.hostname);
          resolvedConnectionString = url.toString();
        } else {
          resolvedConnectionString = connectionString;
        }
      } catch (err) {
        console.error("[Database] URL resolution failed", err);
        resolvedConnectionString = connectionString;
      }
    }

    pool = new Pool({
      connectionString: resolvedConnectionString,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      max: 20
    });

    pool.on('error', (err) => {
      console.error('[Database Pool Error]', err);
      // Reset pool on fatal errors to trigger re-connection/re-resolution
      pool = null;
    });
  }
  return pool;
};

export class Database extends Context.Tag("Database")<
  Database,
  {
    readonly query: (sql: string, params?: any[]) => Effect.Effect<any[], DatabaseError>;
    readonly queryOne: (sql: string, params?: any[]) => Effect.Effect<any, DatabaseError>;
    readonly execute: (sql: string, params?: any[]) => Effect.Effect<void, DatabaseError>;
  }
>() { }

export const createDatabaseLayer = (connectionString: string): Layer.Layer<Database, DatabaseError> => {
  return Layer.succeed(
    Database,
    Database.of({
      query: (sql, params = []) =>
        Effect.tryPromise({
          try: async () => {
            const currentPool = await getPool(connectionString);
            const result = await currentPool.query(sql, params);
            return result.rows;
          },
          catch: (error) => {
            console.error(`[Database Error] SQL: ${sql}`, error);
            return new DatabaseError(`Query failed: ${sql}`, error);
          }
        }).pipe(
          Effect.retry({
            times: 2,
            schedule: Schedule.exponential(500),
          })
        ),

      queryOne: (sql, params = []) =>
        Effect.tryPromise({
          try: async () => {
            const currentPool = await getPool(connectionString);
            const result = await currentPool.query(sql, params);
            return result.rows[0];
          },
          catch: (error) => {
            console.error(`[Database Error] SQL: ${sql}`, error);
            return new DatabaseError(`Query failed: ${sql}`, error);
          }
        }).pipe(
          Effect.retry({
            times: 2,
            schedule: Schedule.exponential(500),
          })
        ),

      execute: (sql, params = []) =>
        Effect.tryPromise({
          try: async () => {
            const currentPool = await getPool(connectionString);
            await currentPool.query(sql, params);
          },
          catch: (error) => {
            console.error(`[Database Error] SQL: ${sql}`, error);
            return new DatabaseError(`Execute failed: ${sql}`, error);
          }
        }).pipe(
          Effect.retry({
            times: 2,
            schedule: Schedule.exponential(500),
          })
        ),
    })
  );
};
