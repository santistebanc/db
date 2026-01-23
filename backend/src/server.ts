import { Effect, Layer } from "effect"
import { Schema } from "effect"
import * as http from "node:http"
import { Pool } from "pg"
import { DocService, DocServiceLive, DbPool, DbPoolLive } from "./DocService.js"
import { DocInputSchema, SearchRequestSchema } from "./Doc.js"

// Simple HTTP server using Node.js built-in
const PORT = parseInt(process.env.PORT || "3001", 10)
const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/docs_db"
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*"

// CORS headers
const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
}

// Convert Doc to JSON
const docToJson = (doc: { id: string; label: string; data: unknown; created_at: Date }) => ({
    id: doc.id,
    label: doc.label,
    data: doc.data,
    created_at: doc.created_at.toISOString()
})

// Parse request body
const parseBody = (req: http.IncomingMessage): Promise<unknown> => {
    return new Promise((resolve, reject) => {
        let body = ""
        req.on("data", (chunk) => { body += chunk })
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {})
            } catch (e) {
                reject(e)
            }
        })
        req.on("error", reject)
    })
}

// Send JSON response
const sendJson = (res: http.ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, corsHeaders)
    res.end(JSON.stringify(data))
}

// Route handler type
type RouteHandler = (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    params: Record<string, string>
) => Effect.Effect<void, unknown, DocService>

// Routes
const routes: Array<{
    method: string
    pattern: RegExp
    handler: RouteHandler
}> = [
        // Health check
        {
            method: "GET",
            pattern: /^\/health$/,
            handler: (_req, res) => Effect.sync(() => {
                sendJson(res, 200, { status: "ok" })
            })
        },

        // Get all docs
        {
            method: "GET",
            pattern: /^\/api\/docs$/,
            handler: (_req, res) => Effect.gen(function* () {
                const service = yield* DocService
                const docs = yield* service.getAll()
                sendJson(res, 200, docs.map(docToJson))
            })
        },

        // Get doc by ID
        {
            method: "GET",
            pattern: /^\/api\/docs\/([^/]+)$/,
            handler: (_req, res, params) => Effect.gen(function* () {
                const service = yield* DocService
                const doc = yield* service.getById(params.id!)
                if (!doc) {
                    sendJson(res, 404, { error: "Not found" })
                } else {
                    sendJson(res, 200, docToJson(doc))
                }
            })
        },

        // Create doc
        {
            method: "POST",
            pattern: /^\/api\/docs$/,
            handler: (req, res) => Effect.gen(function* () {
                const service = yield* DocService
                const body = yield* Effect.promise(() => parseBody(req))
                const input = yield* Schema.decodeUnknown(DocInputSchema)(body)
                const doc = yield* service.create(input)
                sendJson(res, 201, docToJson(doc))
            })
        },

        // Update doc
        {
            method: "PUT",
            pattern: /^\/api\/docs\/([^/]+)$/,
            handler: (req, res, params) => Effect.gen(function* () {
                const service = yield* DocService
                const body = yield* Effect.promise(() => parseBody(req))
                const input = yield* Schema.decodeUnknown(Schema.Struct({
                    label: Schema.optional(Schema.String),
                    data: Schema.optional(Schema.Unknown)
                }))(body)
                const doc = yield* service.update({
                    id: params.id!,
                    label: input.label,
                    data: input.data
                })
                if (!doc) {
                    sendJson(res, 404, { error: "Not found" })
                } else {
                    sendJson(res, 200, docToJson(doc))
                }
            })
        },

        // Delete doc
        {
            method: "DELETE",
            pattern: /^\/api\/docs\/([^/]+)$/,
            handler: (_req, res, params) => Effect.gen(function* () {
                const service = yield* DocService
                yield* service.delete(params.id!)
                sendJson(res, 200, { success: true })
            })
        },

        // Search docs
        {
            method: "POST",
            pattern: /^\/api\/docs\/search$/,
            handler: (req, res) => Effect.gen(function* () {
                const service = yield* DocService
                const body = yield* Effect.promise(() => parseBody(req))
                const input = yield* Schema.decodeUnknown(SearchRequestSchema)(body)
                const docs = yield* service.search(input)
                sendJson(res, 200, docs.map(docToJson))
            })
        }
    ]

// Match route
const matchRoute = (method: string, url: string) => {
    for (const route of routes) {
        if (route.method === method) {
            const match = url.match(route.pattern)
            if (match) {
                const params: Record<string, string> = {}
                if (match[1]) params.id = match[1]
                return { handler: route.handler, params }
            }
        }
    }
    return null
}

// DbPool layer
const PoolLayer = DbPoolLive(DATABASE_URL)

// Compose DocServiceLive with DbPool
const AppLive = DocServiceLive.pipe(Layer.provide(PoolLayer))

// Main server
const main = Effect.gen(function* () {
    yield* Effect.log(`🚀 Starting server on http://localhost:${PORT}`)
    yield* Effect.log(`📦 Database: ${DATABASE_URL}`)

    const server = http.createServer((req, res) => {
        const url = req.url?.split("?")[0] || "/"
        const method = req.method || "GET"

        // Handle CORS preflight
        if (method === "OPTIONS") {
            res.writeHead(204, corsHeaders)
            res.end()
            return
        }

        const matched = matchRoute(method, url)

        if (!matched) {
            sendJson(res, 404, { error: "Not found" })
            return
        }

        const effect = matched.handler(req, res, matched.params).pipe(
            Effect.catchAll((error) => Effect.sync(() => {
                console.error("Error:", error)
                sendJson(res, 500, { error: String(error) })
            }))
        )

        Effect.runPromise(
            effect.pipe(
                Effect.provide(AppLive)
            )
        ).catch((err) => {
            console.error("Fatal error:", err)
            sendJson(res, 500, { error: "Internal server error" })
        })
    })

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`)
    })

    // Keep the server running
    yield* Effect.never
})

Effect.runPromise(main).catch(console.error)
