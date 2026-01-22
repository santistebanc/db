import { Effect, Context, Layer, Schedule } from "effect";
import { Pool } from "pg";

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

// Shared connection pool
let pool: Pool | null = null;

const getPool = (connectionString: string): Pool => {
  if (!pool) {
    pool = new Pool({ connectionString });
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
            const pool = getPool(connectionString);
            const result = await pool.query(sql, params);
            return result.rows;
          },
          catch: (error) => new DatabaseError(`Query failed: ${sql}`, error),
        }).pipe(
          Effect.retry({
            times: 3,
            schedule: Schedule.exponential(100),
          })
        ),

      queryOne: (sql, params = []) =>
        Effect.tryPromise({
          try: async () => {
            const pool = getPool(connectionString);
            const result = await pool.query(sql, params);
            return result.rows[0];
          },
          catch: (error) => new DatabaseError(`Query failed: ${sql}`, error),
        }).pipe(
          Effect.retry({
            times: 3,
            schedule: Schedule.exponential(100),
          })
        ),

      execute: (sql, params = []) =>
        Effect.tryPromise({
          try: async () => {
            const pool = getPool(connectionString);
            await pool.query(sql, params);
          },
          catch: (error) => new DatabaseError(`Execute failed: ${sql}`, error),
        }).pipe(
          Effect.retry({
            times: 3,
            schedule: Schedule.exponential(100),
          })
        ),
    })
  );
};
