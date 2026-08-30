// A managed key is kept on the server. It is intentionally not an API key.
export const MANAGED_GROQ_KEY = "managed"

// Reuse the selected model for the rest of this browser session.
let cachedModel = null

export async function getAvailableModel(key) {
  if (key === MANAGED_GROQ_KEY) return "llama-3.3-70b-versatile"
  if (cachedModel) return cachedModel

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await response.json()

    if (response.ok && data.data?.length > 0) {
      cachedModel = data.data[0].id
      return cachedModel
    }
  } catch {
    // Use the fallback model below if the available-model request fails.
  }

  cachedModel = "llama-3.3-70b-versatile"
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
