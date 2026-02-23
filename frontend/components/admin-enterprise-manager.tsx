"use client"

import { useEffect, useState, useCallback } from "react"
import { apiClient } from "@/lib/api-client"

type EnterpriseSetting = {
  id: string
  guildId: string
  domain: string | null
  ssoEnabled: boolean
  ssoProvider: string | null
  ssoConfig: any | null
  branding: any | null
  createdAt: string
}

export function AdminEnterpriseManager() {
  const [settings, setSettings] = useState<EnterpriseSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    id: "",
    guildId: "",
    domain: "",
    ssoEnabled: false,
    ssoProvider: "Okta",
    ssoConfig: "{}",
    branding: "{}"
  })

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient<EnterpriseSetting[]>('/api/admin/enterprise')
      setSettings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load enterprise settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleEdit = (setting: EnterpriseSetting) => {
    setFormData({
      id: setting.id,
      guildId: setting.guildId,
      domain: setting.domain || "",
      ssoEnabled: setting.ssoEnabled,
      ssoProvider: setting.ssoProvider || "Okta",
      ssoConfig: setting.ssoConfig ? JSON.stringify(setting.ssoConfig, null, 2) : "{}",
      branding: setting.branding ? JSON.stringify(setting.branding, null, 2) : "{}"
    })
    setModalOpen(true)
  }

  const handleCreate = () => {
    setFormData({
      id: "",
      guildId: "",
      domain: "",
      ssoEnabled: false,
      ssoProvider: "Okta",
      ssoConfig: "{}",
      branding: "{}"
    })
    setModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this enterprise configuration?")) return
    try {
      await apiClient(`/api/admin/enterprise?id=${id}`, { method: "DELETE" })
      loadSettings()
    } catch (err) {
      alert("Failed to delete")
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      let parsedConfig = null
      let parsedBranding = null
      
      if (formData.ssoConfig.trim()) parsedConfig = JSON.parse(formData.ssoConfig)
      if (formData.branding.trim()) parsedBranding = JSON.parse(formData.branding)

      await apiClient('/api/admin/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId: formData.guildId,
          domain: formData.domain.trim() || null,
          ssoEnabled: formData.ssoEnabled,
          ssoProvider: formData.ssoProvider.trim() || null,
          ssoConfig: parsedConfig,
          branding: parsedBranding
        })
      })
      setModalOpen(false)
      loadSettings()
    } catch (err) {
      alert("Validation error. Ensure JSON fields are formatted correctly.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Enterprise Configurations</h3>
            <p className="text-xs text-foreground/60">
              Manage SSO/SAML integrations and white-label branding for Scale & Enterprise guilds.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadSettings}
              disabled={loading}
              className="px-4 py-2 border border-border/60 rounded-lg text-sm hover:bg-card/40 transition-colors"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Add Configuration
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        
        <div className="border border-border/40 rounded-lg overflow-hidden bg-background/50">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-foreground/70">
              <tr>
                <th className="p-4 font-medium">Guild ID</th>
                <th className="p-4 font-medium">Domain</th>
                <th className="p-4 font-medium">SSO</th>
                <th className="p-4 font-medium">Branding</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {settings.map(setting => (
                <tr key={setting.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 font-mono text-xs">{setting.guildId}</td>
                  <td className="p-4">{setting.domain || <span className="text-foreground/40 italic">None</span>}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${setting.ssoEnabled ? 'bg-primary/10 text-primary' : 'bg-foreground/10 text-foreground/60'}`}>
                      {setting.ssoEnabled ? setting.ssoProvider || "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="p-4 text-xs">
                    {setting.branding ? "Configured" : "Default"}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button 
                        onClick={() => handleEdit(setting)}
                        className="px-3 py-1.5 border border-border/60 rounded text-xs hover:bg-muted transition-colors"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(setting.id)}
                        className="px-3 py-1.5 border border-red-500/30 text-red-500 rounded text-xs hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {settings.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-foreground/50">
                    No enterprise configurations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {loading && (
             <p className="text-sm text-center p-8 text-foreground/60">Loading data...</p>
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-hidden">
          <div className="w-full max-w-lg bg-background border border-border/80 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-border/60">
              <h3 className="text-xl font-bold">{formData.id ? "Edit Enterprise Settings" : "New Enterprise Settings"}</h3>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 muted-scroll">
              <div>
                <label className="text-sm font-semibold mb-1 block">Guild ID</label>
                <input 
                  type="text" 
                  value={formData.guildId}
                  onChange={(e) => setFormData({...formData, guildId: e.target.value})}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">Custom Domain (Optional)</label>
                <input 
                  type="text" 
                  value={formData.domain}
                  onChange={(e) => setFormData({...formData, domain: e.target.value})}
                  placeholder="e.g. portal.company.com"
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="sso-toggle"
                  checked={formData.ssoEnabled}
                  onChange={(e) => setFormData({...formData, ssoEnabled: e.target.checked})}
                  className="rounded border-border text-primary focus:ring-primary/50 scale-110"
                />
                <label htmlFor="sso-toggle" className="text-sm font-semibold cursor-pointer select-none">Enable SSO (SAML/OIDC)</label>
              </div>

              {formData.ssoEnabled && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
                  <div>
                    <label className="text-sm font-semibold mb-1 block">Provider Name</label>
                    <select
                      value={formData.ssoProvider}
                      onChange={(e) => setFormData({...formData, ssoProvider: e.target.value})}
                      className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    >
                      <option value="Okta">Okta</option>
                      <option value="AzureAD">Azure AD</option>
                      <option value="Auth0">Auth0</option>
                      <option value="GoogleWorkspace">Google Workspace</option>
                      <option value="Custom">Custom / Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1 block">SSO JSON Configuration</label>
                    <textarea 
                      value={formData.ssoConfig}
                      onChange={(e) => setFormData({...formData, ssoConfig: e.target.value})}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
                      rows={4}
                      placeholder="{}"
                    />
                  </div>
                </div>
              )}

               <div>
                <label className="text-sm font-semibold mb-1 block">Branding JSON Configuration</label>
                <p className="text-xs text-foreground/50 mb-2">Example: <code>{`{ "logo": "url", "colors": { "primary": "#ffaa00" } }`}</code></p>
                <textarea 
                  value={formData.branding}
                  onChange={(e) => setFormData({...formData, branding: e.target.value})}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
                  rows={4}
                />
              </div>
            </form>

            <div className="px-6 py-4 border-t border-border/60 flex justify-end gap-3 align-center">
              <button 
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-border/60 rounded-lg text-sm font-semibold hover:bg-card/40 transition-colors"
              >
                Cancel
              </button>
              <button 
                 onClick={handleSave}
                 disabled={saving}
                 className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
