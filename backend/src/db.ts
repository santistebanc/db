import { Effect, Context, Layer, Schedule } from "effect";
import { Pool } from "pg";
import { lookup } from "dns";
import { promisify } from "util";

const lookupAsync = promisify(lookup);

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

const resolveHostname = async (hostname: string, maxRetries = 5): Promise<string> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Force IPv4 and use a small timeout for each attempt
      const { address } = await lookupAsync(hostname, { family: 4 });
      if (address) return address;
    } catch (err) {
      if (i === maxRetries - 1) {
        console.error(`[Database] All DNS resolution attempts failed for ${hostname}`);
        throw err;
      }
      const delay = Math.pow(2, i) * 200;
      console.warn(`[Database] DNS resolution for ${hostname} failed (Attempt ${i + 1}/${maxRetries}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return hostname;
};

const getPool = async (connectionString: string): Promise<Pool> => {
  if (!pool) {
    if (!resolvedConnectionString) {
      try {
        const url = new URL(connectionString);
        const hostname = url.hostname;

        if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) && hostname !== 'localhost') {
          console.log(`[Database] Pre-resolving hostname: ${hostname}`);
          const address = await resolveHostname(hostname);
          console.log(`[Database] Success: Resolved ${hostname} to ${address}`);
          url.hostname = address;
          resolvedConnectionString = url.toString();
        } else {
          resolvedConnectionString = connectionString;
        }
      } catch (err: any) {
        console.error("[Database] Critical DNS failure, falling back to original string", err);
        resolvedConnectionString = connectionString;
      }
    }

    pool = new Pool({
      connectionString: resolvedConnectionString,
      connectionTimeoutMillis: 15000, // Increased timeout
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
