import { Schema } from "effect"

// Doc entity schema using Effect Schema
export class Doc extends Schema.Class<Doc>("Doc")({
    id: Schema.String,
    label: Schema.String,
    data: Schema.Unknown, // JSONB - can be any JSON value
    created_at: Schema.DateFromString
}) { }

// Schema for creating a new doc (without id and created_at)
export const DocInputSchema = Schema.Struct({
    label: Schema.String,
    data: Schema.optional(Schema.Unknown)
})

export type DocInput = typeof DocInputSchema.Type

// Schema for updating a doc
export const DocUpdateSchema = Schema.Struct({
    id: Schema.String,
    label: Schema.optional(Schema.String),
    data: Schema.optional(Schema.Unknown)
})

export type DocUpdate = typeof DocUpdateSchema.Type

// Schema for search request
export const SearchRequestSchema = Schema.Struct({
    query: Schema.String,
    mode: Schema.optional(Schema.Literal("semantic", "fulltext")),
    limit: Schema.optional(Schema.Number)
})

export type SearchRequest = typeof SearchRequestSchema.Type

// Encoded types for JSON serialization
export const DocEncoded = Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    data: Schema.Unknown,
    created_at: Schema.String
})

export type DocEncodedType = typeof DocEncoded.Type
