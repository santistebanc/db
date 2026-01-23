import { Effect, Context, Layer, Schedule } from "effect";
import { Pool } from "pg";
import * as dns from "dns/promises";

// Explicitly use Docker's internal DNS resolver
try {
  dns.setServers(["127.0.0.11", "8.8.8.8"]);
} catch (e) {
  console.warn("[Database] Could not set custom DNS servers", e);
}

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

/**
 * Ultra-persistent DNS resolution. 
 * Tries several hostnames with multiple retries to overcome ESERVFAIL in Dokploy.
 */
const forcefulResolve = async (hostname: string, maxRetries = 10): Promise<string> => {
  const hostnamesToTry = [hostname, "db-postgres-1", "db_postgres"];

  for (let i = 0; i < maxRetries; i++) {
    for (const host of hostnamesToTry) {
      try {
        console.log(`[Database] DNS Attempt ${i + 1}/${maxRetries} for: ${host}`);
        const addresses = await dns.resolve4(host);
        if (addresses && addresses.length > 0) {
          console.log(`[Database] SUCCESS: Resolved ${host} to IP: ${addresses[0]}`);
          return addresses[0];
        }
      } catch (err) {
        // Only log on last retry to stay clean
        if (i === maxRetries - 1) {
          console.warn(`[Database] DNS Final match failed for ${host}: ${String(err)}`);
        }
      }
    }
    // Wait 1s before retrying to allow Docker DNS to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.error(`[Database] FATAL: All ${maxRetries} DNS attempts failed. Falling back to original hostname.`);
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
