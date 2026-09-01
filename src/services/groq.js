// A managed key is kept on the server. It is intentionally not an API key.
export const MANAGED_GROQ_KEY = "managed"
const DEFAULT_MODEL = "openai/gpt-oss-20b"
const PREFERRED_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "qwen/qwen3.6-27b", DEFAULT_MODEL, "groq/compound", "groq/compound-mini"]

// Reuse the selected model for the rest of this browser session.
let cachedModels = null
let cachedKey = null

function isChatModel(model) {
  return !/(whisper|speech|audio|guard|embedding)/i.test(model)
}

function canFailOver(status) {
  return [400, 403, 404, 408, 409, 410, 422, 429].includes(status) || status >= 500
}

async function getAvailableModels(key, refresh = false) {
  if (cachedKey !== key || refresh) {
    cachedKey = key
    cachedModels = null
  }
  if (cachedModels) return cachedModels

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await response.json()
    const available = data.data?.map(model => model.id).filter(isChatModel) || []
    if (response.ok && available.length) {
      cachedModels = [
        ...PREFERRED_MODELS.filter(model => available.includes(model)),
        ...available.filter(model => !PREFERRED_MODELS.includes(model)),
      ]
      return cachedModels
    }
  } catch {
    // Probe known models when discovery is temporarily unavailable.
  }

  return PREFERRED_MODELS
}

export async function getAvailableModel(key) {
  if (key === MANAGED_GROQ_KEY) return DEFAULT_MODEL
  return (await getAvailableModels(key))[0] || DEFAULT_MODEL
}

export async function callGroq(key, messages, maxTokens = 1500, options = {}) {
  const quality = options.quality || "high"
  const reasoningEffort = options.reasoningEffort || "medium"
  if (key === MANAGED_GROQ_KEY) {
    const response = await fetch("/api/groq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, maxTokens, quality, reasoningEffort }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error?.message || `API error ${response.status}`)
    return data.choices?.[0]?.message?.content || ""
  }

  // Personal-key mode receives the same automatic model failover as the server proxy.
  const attemptedModels = new Set()
  let lastError = "No accessible Groq model is available."
  for (let pass = 0; pass < 2; pass += 1) {
    for (const model of await getAvailableModels(key, pass === 1)) {
      if (attemptedModels.has(model)) continue
      attemptedModels.add(model)

      try {
        const modelOptions = model.startsWith("openai/gpt-oss-") ? { reasoning_effort: reasoningEffort } : {}
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens, ...modelOptions }),
        })
        const data = await response.json().catch(() => ({}))
        if (response.ok) return data.choices?.[0]?.message?.content || ""

        lastError = data.error?.message || `API error ${response.status}`
        if (!canFailOver(response.status)) {
          const terminalError = new Error(lastError)
          terminalError.stopFailover = true
          throw terminalError
        }
      } catch (error) {
        if (error.stopFailover) throw error
        lastError = error.message || lastError
      }
    }
  }

  throw new Error(lastError)
}
