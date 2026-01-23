import { useState, useEffect, useCallback } from 'react'

// Types
interface Doc {
    id: string
    label: string
    data: unknown
    created_at: string
}

type ToastType = 'success' | 'error'

interface Toast {
    id: number
    message: string
    type: ToastType
}

// API configuration
// In production, use the VITE_API_URL env var or same origin for reverse proxy setups
const API_URL = import.meta.env.VITE_API_URL || (
    typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? '' // Same origin - API proxied at same domain
        : 'http://localhost:3001'
)

// API functions
const api = {
    async getDocs(): Promise<Doc[]> {
        const res = await fetch(`${API_URL}/api/docs`)
        if (!res.ok) throw new Error('Failed to fetch docs')
        return res.json()
    },

    async createDoc(label: string, data: unknown): Promise<Doc> {
        const res = await fetch(`${API_URL}/api/docs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, data })
        })
        if (!res.ok) throw new Error('Failed to create doc')
        return res.json()
    },

    async updateDoc(id: string, label?: string, data?: unknown): Promise<Doc> {
        const res = await fetch(`${API_URL}/api/docs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, data })
        })
        if (!res.ok) throw new Error('Failed to update doc')
        return res.json()
    },

    async deleteDoc(id: string): Promise<void> {
        const res = await fetch(`${API_URL}/api/docs/${id}`, {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to delete doc')
    },

    async searchDocs(query: string, mode: 'semantic' | 'fulltext' = 'fulltext'): Promise<Doc[]> {
        const res = await fetch(`${API_URL}/api/docs/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, mode })
        })
        if (!res.ok) throw new Error('Failed to search docs')
        return res.json()
    }
}

// Icons as components
const SearchIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
    </svg>
)

const PlusIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
)

const EditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
)

const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3,6 5,6 21,6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
)

const ClockIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
    </svg>
)

const DocIcon = () => (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10,9 9,9 8,9" />
    </svg>
)

// Format date
const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

// Format JSON for display
const formatData = (data: unknown): string => {
    try {
        return JSON.stringify(data, null, 2)
    } catch {
        return String(data)
    }
}

// Parse JSON input
const parseJsonInput = (input: string): unknown => {
    if (!input.trim()) return {}
    try {
        return JSON.parse(input)
    } catch {
        // If not valid JSON, treat as plain text
        return { text: input }
    }
}

function App() {
    const [docs, setDocs] = useState<Doc[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchMode, setSearchMode] = useState<'semantic' | 'fulltext'>('fulltext')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingDoc, setEditingDoc] = useState<Doc | null>(null)
    const [formLabel, setFormLabel] = useState('')
    const [formData, setFormData] = useState('')
    const [toasts, setToasts] = useState<Toast[]>([])

    // Toast helper
    const showToast = useCallback((message: string, type: ToastType) => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, message, type }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 3000)
    }, [])

    // Load docs
    const loadDocs = useCallback(async () => {
        try {
            setLoading(true)
            const data = await api.getDocs()
            setDocs(data)
        } catch (error) {
            showToast('Failed to load documents', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadDocs()
    }, [loadDocs])

    // Search docs
    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) {
            loadDocs()
            return
        }
        try {
            setLoading(true)
            const data = await api.searchDocs(searchQuery, searchMode)
            setDocs(data)
        } catch (error) {
            showToast('Search failed', 'error')
        } finally {
            setLoading(false)
        }
    }, [searchQuery, searchMode, loadDocs, showToast])

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(handleSearch, 300)
        return () => clearTimeout(timer)
    }, [searchQuery, searchMode, handleSearch])

    // Open create modal
    const openCreateModal = () => {
        setEditingDoc(null)
        setFormLabel('')
        setFormData('')
        setIsModalOpen(true)
    }

    // Open edit modal
    const openEditModal = (doc: Doc) => {
        setEditingDoc(doc)
        setFormLabel(doc.label)
        setFormData(formatData(doc.data))
        setIsModalOpen(true)
    }

    // Handle form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        try {
            const parsedData = parseJsonInput(formData)

            if (editingDoc) {
                await api.updateDoc(editingDoc.id, formLabel, parsedData)
                showToast('Document updated successfully', 'success')
            } else {
                await api.createDoc(formLabel, parsedData)
                showToast('Document created successfully', 'success')
            }

            setIsModalOpen(false)
            loadDocs()
        } catch (error) {
            showToast(editingDoc ? 'Failed to update document' : 'Failed to create document', 'error')
        }
    }

    // Handle delete
    const handleDelete = async (doc: Doc) => {
        if (!confirm(`Are you sure you want to delete "${doc.label}"?`)) return

        try {
            await api.deleteDoc(doc.id)
            showToast('Document deleted successfully', 'success')
            loadDocs()
        } catch (error) {
            showToast('Failed to delete document', 'error')
        }
    }

    return (
        <div className="app">
            <div className="container">
                {/* Header */}
                <header className="header">
                    <h1>📄 Docs Search</h1>
                    <p>Search and manage your documents with semantic and full-text search.</p>
                </header>

                {/* Search Section */}
                <section className="search-section">
                    <div className="search-container">
                        <div className="search-input-wrapper">
                            <span className="search-icon">
                                <SearchIcon />
                            </span>
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search documents by label, date, or any field in data..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="search-filters">
                            <button
                                className={`filter-btn ${searchMode === 'fulltext' ? 'active' : ''}`}
                                onClick={() => setSearchMode('fulltext')}
                            >
                                Full Text
                            </button>
                            <button
                                className={`filter-btn ${searchMode === 'semantic' ? 'active' : ''}`}
                                onClick={() => setSearchMode('semantic')}
                            >
                                Semantic
                            </button>
                        </div>
                    </div>
                </section>

                {/* Actions */}
                <div className="actions">
                    <button className="btn btn-primary" onClick={openCreateModal}>
                        <PlusIcon />
                        Add Document
                    </button>
                    <button className="btn btn-secondary" onClick={loadDocs}>
                        Refresh
                    </button>
                </div>

                {/* Stats */}
                <div className="stats-bar">
                    <div className="stat">
                        <span className="stat-value">{docs.length}</span>
                        <span className="stat-label">Documents</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">
                            {searchQuery ? 'Filtered' : 'All'}
                        </span>
                        <span className="stat-label">View</span>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="loading">
                        <div className="spinner" />
                        <span>Loading documents...</span>
                    </div>
                ) : docs.length === 0 ? (
                    <div className="empty-state">
                        <DocIcon />
                        <h3>No documents found</h3>
                        <p>Create your first document or try a different search query.</p>
                    </div>
                ) : (
                    <div className="docs-grid">
                        {docs.map((doc) => (
                            <div key={doc.id} className="doc-card">
                                <div className="doc-header">
                                    <span className="doc-label">{doc.label}</span>
                                    <span className="doc-id">{doc.id.slice(0, 8)}...</span>
                                </div>
                                <div className="doc-data">
                                    <pre>{formatData(doc.data)}</pre>
                                </div>
                                <div className="doc-footer">
                                    <span className="doc-date">
                                        <ClockIcon />
                                        {formatDate(doc.created_at)}
                                    </span>
                                    <div className="doc-actions">
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => openEditModal(doc)}
                                        >
                                            <EditIcon />
                                        </button>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleDelete(doc)}
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editingDoc ? 'Edit Document' : 'Create Document'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label htmlFor="label">Label</label>
                                <input
                                    id="label"
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter document label..."
                                    value={formLabel}
                                    onChange={(e) => setFormLabel(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="data">Data (JSON)</label>
                                <textarea
                                    id="data"
                                    className="form-input form-textarea"
                                    placeholder='{"key": "value", "nested": {"field": "data"}}'
                                    value={formData}
                                    onChange={(e) => setFormData(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setIsModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingDoc ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Toasts */}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <div key={toast.id} className={`toast toast-${toast.type}`}>
                        {toast.message}
                    </div>
                ))}
            </div>
        </div>
    )
}

export default App
