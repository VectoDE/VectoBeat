
import { useState, useEffect } from 'react'

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
  createdAt: string
  updatedAt: string
}

export function AdminPluginManager() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  
  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    author: 'VectoBeat',
    price: 0,
    verified: false,
    enabled: true,
    requiresDedicatedInstance: false
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
      requiresDedicatedInstance: plugin.configSchema?.requirements?.dedicatedShard ?? false
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
      requiresDedicatedInstance: false
    })
    setModalOpen(true)
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
