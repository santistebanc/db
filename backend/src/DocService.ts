import { Effect, Layer, Context, pipe } from "effect"
import { Pool, QueryResult } from "pg"
import { Doc, DocInput, DocUpdate, SearchRequest } from "./Doc.js"

// Database pool service
export class DbPool extends Context.Tag("DbPool")<DbPool, Pool>() { }

// DocService interface
export class DocService extends Context.Tag("DocService")<
    DocService,
    {
        readonly create: (input: DocInput) => Effect.Effect<Doc, Error>
        readonly getAll: () => Effect.Effect<readonly Doc[], Error>
        readonly getById: (id: string) => Effect.Effect<Doc | null, Error>
        readonly update: (input: DocUpdate) => Effect.Effect<Doc | null, Error>
        readonly delete: (id: string) => Effect.Effect<boolean, Error>
        readonly search: (request: SearchRequest) => Effect.Effect<readonly Doc[], Error>
    }
>() { }

// Helper to convert DB row to Doc
const rowToDoc = (row: {
    id: string
    label: string
    data: unknown
    created_at: Date | string
}): Doc => {
    const createdAt = typeof row.created_at === "string"
        ? new Date(row.created_at)
        : row.created_at
    return new Doc({
        id: row.id,
        label: row.label,
        data: row.data,
        created_at: createdAt
    })
}

// Execute query helper
const query = <T>(pool: Pool, sql: string, params?: unknown[]): Effect.Effect<T[], Error> =>
    Effect.tryPromise({
        try: async () => {
            const result = await pool.query(sql, params)
            return result.rows as T[]
        },
        catch: (e) => new Error(String(e))
    })

type DbRow = {
    id: string
    label: string
    data: unknown
    created_at: Date
}

// DocService implementation using Effect-TS patterns
export const DocServiceLive = Layer.effect(
    DocService,
    Effect.gen(function* () {
        const pool = yield* DbPool

        // Initialize database table
        yield* query(pool, `
            CREATE TABLE IF NOT EXISTS docs (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                label TEXT NOT NULL,
                data JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `).pipe(Effect.catchAll(() => Effect.succeed([])))

        // Create indexes
        yield* query(pool, `
            CREATE INDEX IF NOT EXISTS idx_docs_data_gin ON docs USING gin(data jsonb_path_ops)
        `).pipe(Effect.catchAll(() => Effect.succeed([])))

        yield* query(pool, `
            CREATE INDEX IF NOT EXISTS idx_docs_label ON docs (label)
        `).pipe(Effect.catchAll(() => Effect.succeed([])))

        return {
            create: (input: DocInput) =>
                Effect.gen(function* () {
                    const dataJson = JSON.stringify(input.data ?? {})
                    const rows = yield* query<DbRow>(pool, `
                        INSERT INTO docs (label, data)
                        VALUES ($1, $2::jsonb)
                        RETURNING id, label, data, created_at
                    `, [input.label, dataJson])

                    const row = rows[0]
                    if (!row) {
                        return yield* Effect.fail(new Error("Failed to create doc"))
                    }
                    return rowToDoc(row)
                }),

            getAll: () =>
                Effect.gen(function* () {
                    const rows = yield* query<DbRow>(pool, `
                        SELECT id, label, data, created_at 
                        FROM docs 
                        ORDER BY created_at DESC
                    `)
                    return rows.map(rowToDoc)
                }),

            getById: (id: string) =>
                Effect.gen(function* () {
                    const rows = yield* query<DbRow>(pool, `
                        SELECT id, label, data, created_at 
                        FROM docs 
                        WHERE id = $1
                    `, [id])
                    const row = rows[0]
                    return row ? rowToDoc(row) : null
                }),

            update: (input: DocUpdate) =>
                Effect.gen(function* () {
                    if (input.label === undefined && input.data === undefined) {
                        const rows = yield* query<DbRow>(pool, `
                            SELECT id, label, data, created_at 
                            FROM docs 
                            WHERE id = $1
                        `, [input.id])
                        const row = rows[0]
                        return row ? rowToDoc(row) : null
                    }

                    let rows: DbRow[]

                    if (input.label !== undefined && input.data !== undefined) {
                        const dataJson = JSON.stringify(input.data)
                        rows = yield* query<DbRow>(pool, `
                            UPDATE docs 
                            SET label = $1, data = $2::jsonb
                            WHERE id = $3
                            RETURNING id, label, data, created_at
                        `, [input.label, dataJson, input.id])
                    } else if (input.label !== undefined) {
                        rows = yield* query<DbRow>(pool, `
                            UPDATE docs 
                            SET label = $1
                            WHERE id = $2
                            RETURNING id, label, data, created_at
                        `, [input.label, input.id])
                    } else {
                        const dataJson = JSON.stringify(input.data)
                        rows = yield* query<DbRow>(pool, `
                            UPDATE docs 
                            SET data = $1::jsonb
                            WHERE id = $2
                            RETURNING id, label, data, created_at
                        `, [dataJson, input.id])
                    }

                    const row = rows[0]
                    return row ? rowToDoc(row) : null
                }),

            delete: (id: string) =>
                Effect.gen(function* () {
                    yield* query(pool, `DELETE FROM docs WHERE id = $1`, [id])
                    return true
                }),

            search: (request: SearchRequest) =>
                Effect.gen(function* () {
                    const queryText = request.query.trim()
                    const limit = request.limit ?? 50

                    if (!queryText) {
                        const rows = yield* query<DbRow>(pool, `
                            SELECT id, label, data, created_at 
                            FROM docs 
                            ORDER BY created_at DESC
                            LIMIT $1
                        `, [limit])
                        return rows.map(rowToDoc)
                    }

                    // Full-text search across label and JSONB data
                    const searchPattern = `%${queryText.toLowerCase()}%`

                    const rows = yield* query<DbRow>(pool, `
                        SELECT id, label, data, created_at 
                        FROM docs 
                        WHERE 
                            LOWER(label) LIKE $1
                            OR LOWER(data::text) LIKE $1
                        ORDER BY 
                            CASE 
                                WHEN LOWER(label) LIKE $1 THEN 0
                                ELSE 1
                            END,
                            created_at DESC
                        LIMIT $2
                    `, [searchPattern, limit])

                    return rows.map(rowToDoc)
                })
        }
    })
)

// Create DbPool layer
export const DbPoolLive = (connectionString: string) =>
    Layer.succeed(DbPool, new Pool({ connectionString }))
