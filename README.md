# Docs Search Application

A full-stack application for managing and searching documents with CRUD operations and full-text search capabilities, built with Effect-TS patterns.

## Tech Stack

- **Backend**: Effect-TS with Node.js, PostgreSQL (`pg` library)
- **Database**: PostgreSQL 16 with JSONB support
- **Frontend**: React 18 with Vite
- **Containerization**: Docker & Docker Compose

## Features

- ✅ CRUD operations for Docs (Create, Read, Update, Delete)
- ✅ Full-text search across label and JSONB data fields
- ✅ **Search nested fields in JSONB data** (e.g., `data.nested.field`)
- ✅ Beautiful dark mode UI with glassmorphism effects
- ✅ Responsive design
- ✅ Effect-TS service architecture

## Doc Entity

```typescript
interface Doc {
  id: string           // UUID auto-generated
  label: string        // Text label for the document
  data: unknown        // JSONB - any JSON structure (supports nested search!)
  created_at: string   // ISO timestamp
}
```

## Getting Started

### With Docker Compose (Recommended)

```bash
# Start all services (PostgreSQL, Backend, Frontend)
docker compose up --build

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
```

### Local Development

#### Prerequisites
- Node.js 22+
- PostgreSQL 16+

#### Backend

```bash
cd backend
npm install
npm run dev
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

#### Backend
- `PORT` - Server port (default: 3001)
- `DATABASE_URL` - PostgreSQL connection string (default: postgres://postgres:postgres@localhost:5432/docs_db)

#### Frontend
- `VITE_API_URL` - Backend API URL (default: http://localhost:3001)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/docs` | Get all docs |
| GET | `/api/docs/:id` | Get doc by ID |
| POST | `/api/docs` | Create new doc |
| PUT | `/api/docs/:id` | Update doc |
| DELETE | `/api/docs/:id` | Delete doc |
| POST | `/api/docs/search` | Search docs |

### Search Request

```json
{
  "query": "search term",
  "limit": 50
}
```

The search looks across:
- `label` field (case-insensitive)
- All nested fields in `data` JSONB (converted to text, case-insensitive)

### Example: Nested Field Search

```bash
# Create a doc with nested data
curl -X POST http://localhost:3001/api/docs \
  -H "Content-Type: application/json" \
  -d '{
    "label": "My Document",
    "data": {
      "title": "Hello World",
      "nested": {
        "field": "searchable value"
      }
    }
  }'

# Search for the nested value
curl -X POST http://localhost:3001/api/docs/search \
  -H "Content-Type: application/json" \
  -d '{"query": "searchable"}'

# Returns the document because it matches data.nested.field
```

## Effect-TS Patterns Used

This project demonstrates proper Effect-TS usage:

1. **Services with Context.Tag** - `DocService` and `DbPool` are defined as tagged services
2. **Layer composition** - `DocServiceLive` with `DbPoolLive` dependency injection
3. **Effect.gen** - Generator-based effect composition for clean async code
4. **Schema validation** - Input validation using `@effect/schema`
5. **Error handling** - Typed error handling with `Effect.fail` and `Effect.catchAll`
6. **Resource management** - PostgreSQL connection pooling

```typescript
// Example: Service definition with Effect-TS
export class DocService extends Context.Tag("DocService")<
    DocService,
    {
        readonly create: (input: DocInput) => Effect.Effect<Doc, Error>
        readonly getAll: () => Effect.Effect<readonly Doc[], Error>
        // ... other methods
    }
>() { }

// Layer composition
const AppLive = DocServiceLive.pipe(Layer.provide(DbPoolLive(DATABASE_URL)))
```

## Project Structure

```
db/
├── docker-compose.yml       # Container orchestration
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts        # HTTP server with routes
│       ├── Doc.ts           # Doc entity schemas
│       └── DocService.ts    # CRUD operations with Effect-TS
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx          # Main React application
        └── index.css        # Premium dark theme styles
```
