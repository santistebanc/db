import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Effect, Layer, Runtime } from "effect";
import { createDatabaseLayer } from "./db";
import { NodeRepository, createNodeRepositoryLayer, NodeNotFound } from "./nodeRepository";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";

app.use(cors());
app.use(express.json());

// Create merged runtime layer - compose layers properly
const layer = createNodeRepositoryLayer().pipe(
  Layer.provide(createDatabaseLayer(DATABASE_URL))
);

// Helper to run effects with proper layer provision
const runWithLayer = async <A, E>(effect: Effect.Effect<A, E, NodeRepository>) => {
  return Effect.runPromise(
    Effect.scoped(effect.pipe(Effect.provide(layer)) as any)
  );
};

// Routes
app.post("/api/nodes", async (req: Request, res: Response) => {
  try {
    const { label, data, tags } = req.body;
    if (!label) {
      res.status(400).json({ error: "Label is required" });
      return;
    }
    const effect = Effect.gen(function* () {
      const repo = yield* NodeRepository;
      return yield* repo.create(label, data || {}, tags || []);
    });
    const result = await runWithLayer(effect as any);
    res.status(201).json(result);
  } catch (error) {
    console.error("Create error:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/nodes/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const effect = Effect.gen(function* () {
      const repo = yield* NodeRepository;
      return yield* repo.read(id);
    });
    const result = await runWithLayer(effect as any);
    if (!result) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    res.json(result);
  } catch (error) {
    if (error instanceof NodeNotFound) {
      res.status(404).json({ error: "Node not found" });
    } else {
      console.error("Read error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.put("/api/nodes/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, data, tags } = req.body;
    if (!label) {
      res.status(400).json({ error: "Label is required" });
      return;
    }
    const effect = Effect.gen(function* () {
      const repo = yield* NodeRepository;
      return yield* repo.update(id, label, data || {}, tags || []);
    });
    const result = await runWithLayer(effect as any);
    res.json(result);
  } catch (error) {
    if (error instanceof NodeNotFound) {
      res.status(404).json({ error: "Node not found" });
    } else {
      console.error("Update error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.delete("/api/nodes/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const effect = Effect.gen(function* () {
      const repo = yield* NodeRepository;
      return yield* repo.delete(id);
    });
    await runWithLayer(effect as any);
    res.status(204).send();
  } catch (error) {
    if (error instanceof NodeNotFound) {
      res.status(404).json({ error: "Node not found" });
    } else {
      console.error("Delete error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/api/nodes", async (req: Request, res: Response) => {
  try {
    const { search, tag } = req.query;
    const effect = Effect.gen(function* () {
      const repo = yield* NodeRepository;
      if (tag) {
        return yield* repo.findByTag(String(tag));
      }
      if (search) {
        return yield* repo.search(String(search));
      }
      return yield* repo.list();
    });
    const result = await runWithLayer(effect as any);
    res.json(result);
  } catch (error) {
    console.error("List/Search error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
