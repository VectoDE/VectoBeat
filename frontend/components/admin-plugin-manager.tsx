
import { useState, useEffect } from 'react'

interface PluginSource {
  id?: string
  language: 'PYTHON' | 'JAVASCRIPT' | 'TYPESCRIPT' | 'LUA'
  filename: string
  content: string
  entryPoint: boolean
}

interface Plugin {
  id: string
  name: string
  description: string
  version: string
  author: string
  price: number
  downloads: number
  rating: number
  verified: boolean
  enabled: boolean
  configSchema?: any
  sources?: PluginSource[]
  createdAt: string
  updatedAt: string
}

export function AdminPluginManager() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  
  // Form state
  const [formData, setFormData] = useState<{
    id: string
    name: string
    description: string
    version: string
    author: string
    price: number
    verified: boolean
    enabled: boolean
    requiresDedicatedInstance: boolean
    sources: PluginSource[]
  }>({
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    author: 'VectoBeat',
    price: 0,
    verified: false,
    enabled: true,
    requiresDedicatedInstance: false,
    sources: []
  })

  useEffect(() => {
    fetchPlugins()
  }, [])

  const fetchPlugins = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/plugins')
      if (res.ok) {
        const data = await res.json()
        setPlugins(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (plugin: Plugin) => {
    setFormData({
      id: plugin.id,
      name: plugin.name ?? '',
      description: plugin.description ?? '',
      version: plugin.version ?? '1.0.0',
      author: plugin.author ?? '',
      price: plugin.price !== undefined && plugin.price !== null ? Number(plugin.price) : 0,
      verified: plugin.verified ?? false,
      enabled: plugin.enabled ?? true,
      requiresDedicatedInstance: plugin.configSchema?.requirements?.dedicatedShard ?? false,
      sources: plugin.sources?.map(s => ({
        id: s.id,
        language: s.language as any,
        filename: s.filename,
        content: s.content,
        entryPoint: s.entryPoint
      })) ?? []
    })
    setModalOpen(true)
  }

  const handleCreate = () => {
    setFormData({
      id: '',
      name: '',
      description: '',
      version: '1.0.0',
      author: 'VectoBeat',
      price: 0,
      verified: false,
      enabled: true,
      requiresDedicatedInstance: false,
      sources: []
    })
    setModalOpen(true)
  }

  const handleAddSource = () => {
    setFormData({
      ...formData,
      sources: [
        ...formData.sources,
        {
          language: 'PYTHON',
          filename: 'main.py',
          content: '',
          entryPoint: formData.sources.length === 0 // Auto-set first as entry point
        }
      ]
    })
  }

  const handleRemoveSource = (index: number) => {
    const newSources = [...formData.sources]
    newSources.splice(index, 1)
    setFormData({ ...formData, sources: newSources })
  }

  const handleUpdateSource = (index: number, field: keyof PluginSource, value: any) => {
    const newSources = [...formData.sources]
    newSources[index] = { ...newSources[index], [field]: value }
    setFormData({ ...formData, sources: newSources })
  }

  const handleFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      const newSources = [...formData.sources]
      newSources[index] = { 
        ...newSources[index], 
        content,
        filename: file.name
      }
      setFormData({ ...formData, sources: newSources })
    }
    reader.readAsText(file)
  }

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        configSchema: {
          requirements: {
            dedicatedShard: formData.requiresDedicatedInstance
          }
        }
      }
      
      const method = formData.id ? 'PUT' : 'POST'
      const res = await fetch('/api/admin/plugins', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (res.ok) {
        setModalOpen(false)
        fetchPlugins()
      } else {
        alert('Failed to save plugin')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/plugins?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setConfirmDeleteId(null)
        fetchPlugins()
      }
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) return <div className="text-foreground/70">Loading plugins...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Plugin Management</h2>
        <button 
          onClick={handleCreate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Add Plugin
        </button>
      </div>

      <div className="border border-border/60 rounded-lg overflow-hidden bg-card/40">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-foreground/70">
            <tr>
              <th className="p-4 font-medium">Name</th>
              <th className="p-4 font-medium">Version</th>
              <th className="p-4 font-medium">Author</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Requirements</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {plugins.map((plugin) => (
              <tr key={plugin.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-4">
                  <div className="font-semibold">{plugin.name}</div>
                  <div className="text-xs text-foreground/50 truncate max-w-[200px]">{plugin.description}</div>
                </td>
                <td className="p-4 text-foreground/70">{plugin.version}</td>
                <td className="p-4 text-foreground/70">{plugin.author}</td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {plugin.enabled ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500">Enabled</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500">Disabled</span>
                    )}
                    {plugin.verified && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500">Verified</span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-xs text-foreground/60">
                  {plugin.configSchema?.requirements?.dedicatedShard ? (
                    <span className="text-orange-500 font-medium">Dedicated Shard</span>
                  ) : (
                    "Standard"
                  )}
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => handleEdit(plugin)}
                      className="px-3 py-1.5 border border-border/60 rounded text-xs hover:bg-muted transition-colors"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => setConfirmDeleteId(plugin.id)}
                      className="px-3 py-1.5 border border-red-500/30 text-red-500 rounded text-xs hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plugins.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-foreground/50">
                  No plugins found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">{formData.id ? 'Edit Plugin' : 'Add Plugin'}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input 
                    type="text" 
                    value={formData.name ?? ''}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Version</label>
                  <input 
                    type="text" 
                    value={formData.version ?? ''}
                    onChange={(e) => setFormData({...formData, version: e.target.value})}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea 
                  value={formData.description ?? ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 h-24"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Author</label>
                  <input 
                    type="text" 
                    value={formData.author ?? ''}
                    onChange={(e) => setFormData({...formData, author: e.target.value})}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Price</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    value={formData.price ?? 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      setFormData({...formData, price: isNaN(val) ? 0 : val})
                    }}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.enabled ?? true}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    className="rounded border-border bg-muted/50 text-primary focus:ring-primary/50"
                  />
                  <span className="text-sm">Enabled</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.verified ?? false}
                    onChange={(e) => setFormData({...formData, verified: e.target.checked})}
                    className="rounded border-border bg-muted/50 text-primary focus:ring-primary/50"
                  />
                  <span className="text-sm">Verified</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.requiresDedicatedInstance ?? false}
                    onChange={(e) => setFormData({...formData, requiresDedicatedInstance: e.target.checked})}
                    className="rounded border-border bg-muted/50 text-primary focus:ring-primary/50"
                  />
                  <span className="text-sm">Requires Dedicated Shard/Bot Instance</span>
                  <span className="text-xs text-foreground/50 ml-1">(Isolation)</span>
                </label>
              </div>

              <div className="pt-4 border-t border-border/60">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-lg">Scripts</h4>
                  <button
                    onClick={handleAddSource}
                    className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-secondary/80 transition-colors"
                  >
                    Add Script
                  </button>
                </div>
                
                <div className="space-y-6">
                  {formData.sources.map((source, idx) => (
                    <div key={idx} className="p-4 bg-muted/30 rounded-lg border border-border/60 space-y-3">
                      <div className="flex gap-3 items-start">
                        <div className="flex-1 space-y-1">
                          <label className="text-xs font-medium text-foreground/70">Filename</label>
                          <input
                            type="text"
                            value={source.filename}
                            onChange={(e) => handleUpdateSource(idx, 'filename', e.target.value)}
                            className="w-full px-3 py-1.5 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                            placeholder="main.py"
                          />
                        </div>
                        <div className="w-32 space-y-1">
                          <label className="text-xs font-medium text-foreground/70">Language</label>
                          <select
                            value={source.language}
                            onChange={(e) => handleUpdateSource(idx, 'language', e.target.value)}
                            className="w-full px-3 py-1.5 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                          >
                            <option value="PYTHON">Python</option>
                            <option value="JAVASCRIPT">JavaScript</option>
                            <option value="TYPESCRIPT">TypeScript</option>
                            <option value="LUA">Lua</option>
                          </select>
                        </div>
                        <div className="pt-6">
                          <button
                            onClick={() => handleRemoveSource(idx)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                            title="Remove Script"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-end">
                          <label className="text-xs font-medium text-foreground/70">Content</label>
                          <div>
                            <input
                              type="file"
                              id={`file-upload-${idx}`}
                              className="hidden"
                              onChange={(e) => handleFileUpload(idx, e)}
                            />
                            <label
                              htmlFor={`file-upload-${idx}`}
                              className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              Upload File
                            </label>
                          </div>
                        </div>
                        <textarea
                          value={source.content}
                          onChange={(e) => handleUpdateSource(idx, 'content', e.target.value)}
                          className="w-full px-3 py-2 bg-background border border-border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[150px]"
                          placeholder="Paste your script code here..."
                          spellCheck={false}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`entry-${idx}`}
                          checked={source.entryPoint}
                          onChange={(e) => {
                            // Ensure only one entry point if needed, or allow multiple?
                            // Usually one entry point per plugin logic, but let's allow flexibility or auto-uncheck others.
                            // For now, simple toggle.
                             const newSources = formData.sources.map((s, i) => ({
                               ...s,
                               entryPoint: i === idx ? e.target.checked : s.entryPoint // Allow multiple or independent? Let's assume independent for now, but usually one main.
                             }))
                             // Actually, let's enforce single entry point for simplicity if it makes sense, 
                             // but the schema doesn't enforce it. Let's just update the current one.
                             handleUpdateSource(idx, 'entryPoint', e.target.checked)
                          }}
                          className="rounded border-border bg-background text-primary focus:ring-primary/50"
                        />
                        <label htmlFor={`entry-${idx}`} className="text-sm cursor-pointer select-none">
                          Entry Point (Main Script)
                        </label>
                      </div>
                    </div>
                  ))}
                  {formData.sources.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-border/60 rounded-lg text-foreground/50 text-sm">
                      No scripts added yet. Click &quot;Add Script&quot; to get started.
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                Save Plugin
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-2">Delete Plugin?</h3>
            <p className="text-foreground/70 mb-6 text-sm">Are you sure you want to delete this plugin? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
