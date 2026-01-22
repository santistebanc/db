import { Effect, Context, Layer } from "effect";
import { Database, Node, DatabaseError } from "./db";
import { v4 as uuidv4 } from "uuid";

export class NodeNotFound {
  readonly _tag = "NodeNotFound";
  constructor(readonly id: string) {}
}

export class NodeRepository extends Context.Tag("NodeRepository")<
  NodeRepository,
  {
    readonly create: (label: string, data: Record<string, any>, tags?: string[]) => Effect.Effect<Node, DatabaseError>;
    readonly read: (id: string) => Effect.Effect<Node | null, DatabaseError | NodeNotFound>;
    readonly update: (id: string, label: string, data: Record<string, any>, tags?: string[]) => Effect.Effect<Node, DatabaseError | NodeNotFound>;
    readonly delete: (id: string) => Effect.Effect<void, DatabaseError | NodeNotFound>;
    readonly list: () => Effect.Effect<Node[], DatabaseError>;
    readonly search: (query: string) => Effect.Effect<Node[], DatabaseError>;
    readonly findByTag: (tag: string) => Effect.Effect<Node[], DatabaseError>;
  }
>() {}

export const createNodeRepositoryLayer = (): Layer.Layer<NodeRepository, DatabaseError, Database> => {
  return Layer.effect(NodeRepository,
    Effect.gen(function* () {
      const db = yield* Database;

      return NodeRepository.of({
        create: (label: string, data: Record<string, any>, tags = []) =>
          Effect.gen(function* () {
            const id = uuidv4();
            const now = new Date();
            const result = yield* db.queryOne(
              `INSERT INTO nodes (id, label, data, tags, created_at) 
               VALUES ($1, $2, $3, $4, $5) 
               RETURNING id, label, data, tags, created_at`,
              [id, label, JSON.stringify(data), tags, now]
            );
            return {
              id: result.id,
              label: result.label,
              data: typeof result.data === "string" ? JSON.parse(result.data) : result.data,
              tags: result.tags || [],
              created_at: result.created_at,
            } as Node;
          }),

        read: (id: string) =>
          Effect.gen(function* () {
            const result = yield* db.queryOne(`SELECT * FROM nodes WHERE id = $1`, [id]);
            if (!result) {
              yield* Effect.fail(new NodeNotFound(id));
            }
            return {
              id: result.id,
              label: result.label,
              data: typeof result.data === "string" ? JSON.parse(result.data) : result.data,
              tags: result.tags || [],
              created_at: result.created_at,
            } as Node;
          }),

        update: (id: string, label: string, data: Record<string, any>, tags = []) =>
          Effect.gen(function* () {
            const result = yield* db.queryOne(
              `UPDATE nodes SET label = $1, data = $2, tags = $3 WHERE id = $4 RETURNING id, label, data, tags, created_at`,
              [label, JSON.stringify(data), tags, id]
            );
            if (!result) {
              yield* Effect.fail(new NodeNotFound(id));
            }
            return {
              id: result.id,
              label: result.label,
              data: typeof result.data === "string" ? JSON.parse(result.data) : result.data,
              tags: result.tags || [],
              created_at: result.created_at,
            } as Node;
          }),

        delete: (id: string) =>
          Effect.gen(function* () {
            const result = yield* db.query(`DELETE FROM nodes WHERE id = $1 RETURNING id`, [id]);
            if (result.length === 0) {
              yield* Effect.fail(new NodeNotFound(id));
            }
          }),

        list: () =>
          Effect.gen(function* () {
            const results = yield* db.query(`SELECT * FROM nodes ORDER BY created_at DESC`);
            return results.map((row: any) => ({
              id: row.id,
              label: row.label,
              data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
              tags: row.tags || [],
              created_at: row.created_at,
            } as Node));
          }),

        search: (query: string) =>
          Effect.gen(function* () {
            // Multi-faceted search: full-text search on label and data, plus JSONB containment
            const results = yield* db.query(
              `SELECT * FROM nodes 
               WHERE 
                 to_tsvector('english', label || ' ' || COALESCE(data::text, '')) @@ plainto_tsquery('english', $1)
                 OR label ILIKE $2
                 OR data::text ILIKE $2
               ORDER BY 
                 CASE 
                   WHEN label ILIKE $2 THEN 1
                   WHEN to_tsvector('english', label) @@ plainto_tsquery('english', $1) THEN 2
                   ELSE 3
                 END,
                 created_at DESC
               LIMIT 100`,
              [query, `%${query}%`]
            );
            return results.map((row: any) => ({
              id: row.id,
              label: row.label,
              data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
              tags: row.tags || [],
              created_at: row.created_at,
            } as Node));
          }),

        findByTag: (tag: string) =>
          Effect.gen(function* () {
            const results = yield* db.query(
              `SELECT * FROM nodes WHERE $1 = ANY(tags) ORDER BY created_at DESC`,
              [tag.toLowerCase()]
            );
            return results.map((row: any) => ({
              id: row.id,
              label: row.label,
              data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
              tags: row.tags || [],
              created_at: row.created_at,
            } as Node));
          }),
      });
    })
  );
};
