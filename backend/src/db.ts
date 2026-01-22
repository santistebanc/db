import { Effect, Context, Layer, Schedule } from "effect";
import { Pool } from "pg";
import { resolve4 } from "dns/promises";

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

const forcefulResolve = async (hostname: string): Promise<string> => {
  const hostnamesToTry = [hostname, "db-postgres-1"];

  for (const host of hostnamesToTry) {
    try {
      console.log(`[Database] Trying direct DNS resolve for: ${host}`);
      // resolve4 uses raw DNS queries and bypasses OS cache/getaddrinfo
      const addresses = await resolve4(host);
      if (addresses && addresses.length > 0) {
        console.log(`[Database] Successfully resolved ${host} to IP: ${addresses[0]}`);
        return addresses[0];
      }
    } catch (err) {
      console.warn(`[Database] Direct resolve failed for ${host}: ${String(err)}`);
    }
  }
  return hostname;
};

const getPool = async (connectionString: string): Promise<Pool> => {
  if (!pool) {
    if (!resolvedConnectionString) {
      try {
        const url = new URL(connectionString);
        const originalHost = url.hostname;

        if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(originalHost) && originalHost !== 'localhost') {
          const ip = await forcefulResolve(originalHost);
          url.hostname = ip;
          resolvedConnectionString = url.toString();
        } else {
          resolvedConnectionString = connectionString;
        }
      } catch (err: any) {
        console.error("[Database] Pre-resolution failed", err);
        resolvedConnectionString = connectionString;
      }
    }

    pool = new Pool({
      connectionString: resolvedConnectionString,
      connectionTimeoutMillis: 20000, // Higher timeout for slow networks
      idleTimeoutMillis: 30000,
      max: 20
    });

    pool.on('error', (err) => {
      console.error('[Database Pool Error]', err);
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
