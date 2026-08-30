// A managed key is kept on the server. It is intentionally not an API key.
export const MANAGED_GROQ_KEY = "managed"
const DEFAULT_MODEL = "openai/gpt-oss-20b"
const PREFERRED_MODELS = [DEFAULT_MODEL, "qwen/qwen3.8-27b", "qwen/qwen3.6-27b", "groq/compound-mini", "groq/compound"]

// Reuse the selected model for the rest of this browser session.
let cachedModel = null

export async function getAvailableModel(key) {
  if (key === MANAGED_GROQ_KEY) return DEFAULT_MODEL
  if (cachedModel) return cachedModel

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await response.json()

    const availableModels = data.data?.map(model => model.id) || []
    if (response.ok && availableModels.length > 0) {
      const selectedModel = PREFERRED_MODELS.find(model => availableModels.includes(model))
        || availableModels.find(model => !/(whisper|speech|audio|guard|embedding)/i.test(model))
      if (selectedModel) {
        cachedModel = selectedModel
        return cachedModel
      }
    }
  } catch {
    // Use the fallback model below if the available-model request fails.
  }

  cachedModel = DEFAULT_MODEL
  return cachedModel
}

export async function callGroq(key, messages, maxTokens = 1500) {
  if (key === MANAGED_GROQ_KEY) {
    const response = await fetch("/api/groq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, maxTokens }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error?.message || `API error ${response.status}`)
    return data.choices?.[0]?.message?.content || ""
  }

  // Personal keys are used directly only when the hosted shared-key mode is disabled.
  const model = await getAvailableModel(key)
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: maxTokens }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `API error ${response.status}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}
