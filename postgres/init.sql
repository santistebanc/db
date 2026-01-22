CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY,
  label TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indices for better search performance
CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_data ON nodes USING GIN(data);
CREATE INDEX IF NOT EXISTS idx_nodes_tags ON nodes USING GIN(tags);

-- Create full text search index
CREATE INDEX IF NOT EXISTS idx_nodes_tsvector ON nodes 
  USING GIN(to_tsvector('english', label || ' ' || data::text));
