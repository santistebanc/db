import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

interface Node {
  id: string;
  label: string;
  data: Record<string, any>;
  tags: string[];
  created_at: string;
}

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dataFilter, setDataFilter] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newData, setNewData] = useState("{}");
  const [newTags, setNewTags] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editData, setEditData] = useState("{}");
  const [editTags, setEditTags] = useState("");

  const API_URL = process.env.REACT_APP_API_URL || "/api";

  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async (query?: string, tag?: string) => {
    try {
      let url = `${API_URL}/nodes`;
      if (tag) {
        url += `?tag=${encodeURIComponent(tag)}`;
      } else if (query) {
        url += `?search=${encodeURIComponent(query)}`;
      }
      const response = await axios.get<Node[]>(url);
      let filtered = response.data;

      if (dateFilter) {
        filtered = filtered.filter((node) =>
          new Date(node.created_at).toDateString().includes(dateFilter)
        );
      }

      if (dataFilter) {
        filtered = filtered.filter((node) =>
          JSON.stringify(node.data).toLowerCase().includes(dataFilter.toLowerCase())
        );
      }

      setNodes(filtered);
    } catch (error) {
      console.error("Error fetching nodes:", error);
    }
  };

  const handleSearch = () => {
    if (tagFilter.trim()) {
      fetchNodes(undefined, tagFilter);
    } else if (searchQuery.trim()) {
      fetchNodes(searchQuery);
    } else {
      fetchNodes();
    }
  };

  const handleCreate = async () => {
    if (!newLabel.trim()) {
      alert("Label is required");
      return;
    }

    try {
      let dataObj: Record<string, any>;
      try {
        dataObj = JSON.parse(newData);
      } catch {
        alert("Invalid JSON in data field");
        return;
      }

      const tags = newTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      await axios.post(`${API_URL}/nodes`, {
        label: newLabel,
        data: dataObj,
        tags: tags,
      });

      setNewLabel("");
      setNewData("{}");
      setNewTags("");
      fetchNodes();
    } catch (error) {
      console.error("Error creating node:", error);
      alert("Error creating node");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this node?")) {
      try {
        await axios.delete(`${API_URL}/nodes/${id}`);
        fetchNodes();
      } catch (error) {
        console.error("Error deleting node:", error);
        alert("Error deleting node");
      }
    }
  };

  const startEdit = (node: Node) => {
    setEditingId(node.id);
    setEditLabel(node.label);
    setEditData(JSON.stringify(node.data, null, 2));
    setEditTags(node.tags.join(", "));
  };

  const handleUpdate = async () => {
    if (!editingId || !editLabel.trim()) {
      alert("Label is required");
      return;
    }

    try {
      let dataObj: Record<string, any>;
      try {
        dataObj = JSON.parse(editData);
      } catch {
        alert("Invalid JSON in data field");
        return;
      }

      const tags = editTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      await axios.put(`${API_URL}/nodes/${editingId}`, {
        label: editLabel,
        data: dataObj,
        tags: tags,
      });

      setEditingId(null);
      setEditLabel("");
      setEditData("{}");
      setEditTags("");
      fetchNodes();
    } catch (error) {
      console.error("Error updating node:", error);
      alert("Error updating node");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Nodes Search & Management</h1>
      </header>

      <main className="container">
        <section className="create-section">
          <h2>Create New Node</h2>
          <div className="form-group">
            <input
              type="text"
              placeholder="Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="input"
            />
            <textarea
              placeholder='Data (JSON)'
              value={newData}
              onChange={(e) => setNewData(e.target.value)}
              className="textarea"
              rows={3}
            />
            <input
              type="text"
              placeholder="Tags (comma-separated, e.g. important, urgent)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className="input"
            />
            <button onClick={handleCreate} className="btn btn-primary">
              Create Node
            </button>
          </div>
        </section>

        <section className="search-section">
          <h2>Search Nodes</h2>
          <div className="search-filters">
            <input
              type="text"
              placeholder="Full-text search (label, data, nested fields)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="input"
            />
            <input
              type="text"
              placeholder="Filter by tag"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="input"
            />
            <input
              type="text"
              placeholder="Filter by date (e.g., 1/22/2026)"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input"
            />
            <input
              type="text"
              placeholder="Filter by data content"
              value={dataFilter}
              onChange={(e) => setDataFilter(e.target.value)}
              className="input"
            />
            <button onClick={handleSearch} className="btn btn-search">
              Search
            </button>
            <button
              onClick={() => {
                setSearchQuery("");
                setTagFilter("");
                setDateFilter("");
                setDataFilter("");
                fetchNodes();
              }}
              className="btn btn-secondary"
            >
              Clear
            </button>
          </div>
        </section>

        <section className="results-section">
          <h2>Results ({nodes.length})</h2>
          <div className="nodes-grid">
            {nodes.map((node) => (
              <div key={node.id} className="node-card">
                {editingId === node.id ? (
                  <div className="edit-form">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="input"
                      placeholder="Label"
                    />
                    <textarea
                      value={editData}
                      onChange={(e) => setEditData(e.target.value)}
                      className="textarea"
                      rows={4}
                      placeholder="Data (JSON)"
                    />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      className="input"
                      placeholder="Tags (comma-separated)"
                    />
                    <div className="button-group">
                      <button onClick={handleUpdate} className="btn btn-primary">
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3>{node.label}</h3>
                    <p className="node-id">ID: {node.id}</p>
                    <p className="node-date">
                      {new Date(node.created_at).toLocaleString()}
                    </p>
                    {node.tags.length > 0 && (
                      <div className="node-tags">
                        {node.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <pre className="node-data">
                      {JSON.stringify(node.data, null, 2)}
                    </pre>
                    <div className="button-group">
                      <button
                        onClick={() => startEdit(node)}
                        className="btn btn-secondary"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(node.id)}
                        className="btn btn-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {nodes.length === 0 && <p className="no-results">No nodes found</p>}
        </section>
      </main>
    </div>
  );
}

export default App;
