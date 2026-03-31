"use client"

import { useState } from "react"
import { Plus, Trash2, ChevronDown, ChevronUp, Wrench, CheckCircle, Loader2, AlertCircle, X, Lock } from "lucide-react"
import { Input } from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import type { AgentTool, ToolParameter } from "@/types"
import styles from "./ToolsTab.module.css"

function nanoid() {
  return Math.random().toString(36).slice(2, 10)
}

const EMPTY_TOOL: Omit<AgentTool, "id"> = {
  name: "",
  displayName: "",
  description: "",
  url: "",
  method: "GET",
  parameters: [],
}

const EMPTY_PARAM: ToolParameter = {
  name: "",
  type: "string",
  description: "",
  required: false,
}

interface ToolsTabProps {
  agentId: string
  initialTools?: AgentTool[] | null
  elevenlabsAgentId?: string | null
}

function toSnakeCase(str: string) {
  return str.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
}

export function ToolsTab({ agentId, initialTools, elevenlabsAgentId }: ToolsTabProps) {
  const [tools, setTools] = useState<AgentTool[]>(initialTools ?? [])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newTool, setNewTool] = useState<Omit<AgentTool, "id">>(EMPTY_TOOL)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [synced, setSynced] = useState(false)

  if (!elevenlabsAgentId) {
    return (
      <div className={styles.notConnected}>
        <Lock size={32} className={styles.notConnectedIcon} />
        <div className={styles.notConnectedTitle}>Tools not available yet</div>
        <div className={styles.notConnectedDesc}>
          Your agent is still being set up. Tools will be available once setup is complete.
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError("")
    setSuccess(false)
    try {
      const res = await fetch(`/api/agents/${agentId}/tools`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      setSuccess(true)
      setSynced(data.synced)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message ?? "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const handleAddTool = () => {
    if (!newTool.displayName.trim() || !newTool.url.trim()) return
    const tool: AgentTool = {
      ...newTool,
      id: nanoid(),
      name: toSnakeCase(newTool.displayName),
    }
    const updated = [...tools, tool]
    setTools(updated)
    setNewTool(EMPTY_TOOL)
    setAddingNew(false)
    setExpandedId(tool.id)
  }

  const handleDeleteTool = (id: string) => {
    setTools(tools.filter((t) => t.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const handleUpdateTool = (id: string, patch: Partial<AgentTool>) => {
    setTools(tools.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const handleAddParam = (toolId: string) => {
    setTools(tools.map((t) =>
      t.id === toolId
        ? { ...t, parameters: [...t.parameters, { ...EMPTY_PARAM, name: `param_${t.parameters.length + 1}` }] }
        : t
    ))
  }

  const handleUpdateParam = (toolId: string, idx: number, patch: Partial<ToolParameter>) => {
    setTools(tools.map((t) =>
      t.id === toolId
        ? { ...t, parameters: t.parameters.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }
        : t
    ))
  }

  const handleDeleteParam = (toolId: string, idx: number) => {
    setTools(tools.map((t) =>
      t.id === toolId
        ? { ...t, parameters: t.parameters.filter((_, i) => i !== idx) }
        : t
    ))
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Tools</div>
          <div className={styles.subtitle}>
            Connect live data sources — the agent calls these APIs in real-time during conversations to fetch product info, order status, and more.
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {success && (
        <div className={styles.successBanner}>
          <CheckCircle size={14} />
          {synced ? "Tools saved and synced to your agent." : "Tools saved. Connect your agent to sync."}
        </div>
      )}

      {tools.length === 0 && !addingNew && (
        <div className={styles.empty}>
          <Wrench size={32} className={styles.emptyIcon} />
          <div className={styles.emptyTitle}>No tools configured</div>
          <div className={styles.emptyDesc}>
            Add an API endpoint and the agent will call it live during conversations to get up-to-date information.
          </div>
        </div>
      )}

      {tools.map((tool) => (
        <div key={tool.id} className={styles.toolCard}>
          <div className={styles.toolHeader}>
            <button
              type="button"
              className={styles.toolToggle}
              onClick={() => setExpandedId(expandedId === tool.id ? null : tool.id)}
            >
              <div className={styles.toolMeta}>
                <span className={styles.toolName}>{tool.displayName || tool.name}</span>
                <span className={styles.toolMethod}>{tool.method}</span>
                <span className={styles.toolUrl}>{tool.url}</span>
              </div>
              {expandedId === tool.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            <button className={styles.deleteToolBtn} onClick={() => handleDeleteTool(tool.id)}>
              <Trash2 size={14} />
            </button>
          </div>

          {expandedId === tool.id && (
            <div className={styles.toolBody}>
              <div className={styles.fieldRow}>
                <Input
                  label="Display Name"
                  value={tool.displayName}
                  onChange={(e) => handleUpdateTool(tool.id, {
                    displayName: e.target.value,
                    name: toSnakeCase(e.target.value),
                  })}
                  placeholder="e.g. Get Order Status"
                />
                <div className={styles.selectGroup}>
                  <label className={styles.selectLabel}>Method</label>
                  <select
                    className={styles.select}
                    value={tool.method}
                    onChange={(e) => handleUpdateTool(tool.id, { method: e.target.value as "GET" | "POST" })}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
              </div>

              <Input
                label="Endpoint URL"
                value={tool.url}
                onChange={(e) => handleUpdateTool(tool.id, { url: e.target.value })}
                placeholder="https://yoursite.com/api/orders"
              />

              <Input
                label="Description"
                value={tool.description}
                onChange={(e) => handleUpdateTool(tool.id, { description: e.target.value })}
                placeholder="e.g. Fetch the delivery status of an order by order ID. Use when a customer asks about their order."
                hint="Tell the agent when to use this tool and what it does."
              />

              {/* Parameters */}
              <div className={styles.paramsSection}>
                <div className={styles.paramsHeader}>
                  <span className={styles.paramsTitle}>
                    Parameters <span className={styles.paramsHint}>({tool.method === "GET" ? "query params" : "request body"})</span>
                  </span>
                  <button type="button" className={styles.addParamBtn} onClick={() => handleAddParam(tool.id)}>
                    <Plus size={12} /> Add Parameter
                  </button>
                </div>

                {tool.parameters.length === 0 ? (
                  <div className={styles.noParams}>No parameters — the agent will call this URL as-is.</div>
                ) : (
                  <div className={styles.paramsList}>
                    {tool.parameters.map((param, idx) => (
                      <div key={idx} className={styles.paramRow}>
                        <div className={styles.paramFields}>
                          <Input
                            label="Name"
                            value={param.name}
                            onChange={(e) => handleUpdateParam(tool.id, idx, { name: e.target.value })}
                            placeholder="order_id"
                          />
                          <div className={styles.selectGroup}>
                            <label className={styles.selectLabel}>Type</label>
                            <select
                              className={styles.select}
                              value={param.type}
                              onChange={(e) => handleUpdateParam(tool.id, idx, { type: e.target.value as ToolParameter["type"] })}
                            >
                              <option value="string">string</option>
                              <option value="integer">integer</option>
                              <option value="number">number</option>
                              <option value="boolean">boolean</option>
                            </select>
                          </div>
                          <div className={styles.requiredToggle}>
                            <label className={styles.checkLabel}>
                              <input
                                type="checkbox"
                                checked={param.required}
                                onChange={(e) => handleUpdateParam(tool.id, idx, { required: e.target.checked })}
                              />
                              Required
                            </label>
                          </div>
                        </div>
                        <Input
                          label="Description"
                          value={param.description}
                          onChange={(e) => handleUpdateParam(tool.id, idx, { description: e.target.value })}
                          placeholder="e.g. The order ID to look up, e.g. ORD-12345"
                        />
                        <button className={styles.deleteParamBtn} onClick={() => handleDeleteParam(tool.id, idx)}>
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {addingNew && (
        <div className={styles.newToolForm}>
          <div className={styles.newToolTitle}>New Tool</div>
          <div className={styles.fieldRow}>
            <Input
              label="Display Name"
              value={newTool.displayName}
              onChange={(e) => setNewTool((t) => ({ ...t, displayName: e.target.value, name: toSnakeCase(e.target.value) }))}
              placeholder="e.g. Get Order Status"
            />
            <div className={styles.selectGroup}>
              <label className={styles.selectLabel}>Method</label>
              <select
                className={styles.select}
                value={newTool.method}
                onChange={(e) => setNewTool((t) => ({ ...t, method: e.target.value as "GET" | "POST" }))}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
          </div>
          <Input
            label="Endpoint URL"
            value={newTool.url}
            onChange={(e) => setNewTool((t) => ({ ...t, url: e.target.value }))}
            placeholder="https://yoursite.com/api/orders"
          />
          <Input
            label="Description"
            value={newTool.description}
            onChange={(e) => setNewTool((t) => ({ ...t, description: e.target.value }))}
            placeholder="e.g. Fetch delivery status of an order by order ID"
          />
          <div className={styles.newToolActions}>
            <button
              className={styles.saveBtn}
              onClick={handleAddTool}
              disabled={!newTool.displayName.trim() || !newTool.url.trim()}
            >
              Add Tool
            </button>
            <button className={styles.cancelBtn} onClick={() => { setAddingNew(false); setNewTool(EMPTY_TOOL) }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={styles.footer}>
        {!addingNew && (
          <button className={styles.addToolBtn} onClick={() => setAddingNew(true)}>
            <Plus size={14} /> Add Tool
          </button>
        )}
        {tools.length > 0 && (
          <Button onClick={handleSave} loading={saving}>
            {saving ? "Saving…" : "Save Tools"}
          </Button>
        )}
      </div>

    </div>
  )
}

export default ToolsTab
