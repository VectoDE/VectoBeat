export type ApiScopeDefinition = {
  value: string
  label: string
  description: string
}

export const API_SCOPE_DEFINITIONS: ApiScopeDefinition[] = [
  {
    value: "queue.read",
    label: "Queue read",
    description: "Read-only access to active queue state and metadata.",
  },
  {
    value: "queue.write",
    label: "Queue write",
    description: "Enqueue, remove, and reorder tracks on behalf of users.",
  },
  {
    value: "automation.manage",
    label: "Automation manage",
    description: "Trigger automation workflows and fetch audit trails.",
  },
  {
    value: "integrations.manage",
    label: "Integrations manage",
    description: "Manage webhook subscriptions and send test events.",
  },
]

export const DEFAULT_API_SCOPES = ["queue.read"]

export const sanitizeScopes = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [...DEFAULT_API_SCOPES]
  }
  const allowed = new Set(API_SCOPE_DEFINITIONS.map((scope) => scope.value))
  const normalized = input
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value && allowed.has(value))
  if (normalized.length === 0) {
    return [...DEFAULT_API_SCOPES]
  }
  return Array.from(new Set(normalized))
}
