import { consumeRateLimit, sendLimitResponse } from "../server/rateLimit.js"
import { estimateTokens, requestOriginAllowed, validateChatMessages } from "../server/requestGuards.js"

// Vercel serverless endpoint. Keep GROQ_API_KEY server-side: never prefix it
// with VITE_ or send it to the browser.
const GROQ_BASE_URL = "https://api.groq.com/openai/v1"
const HIGH_QUALITY_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-20b",
  "groq/compound",
  "groq/compound-mini",
]
const FAST_MODELS = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "qwen/qwen3.6-27b",
  "groq/compound-mini",
  "groq/compound",
  "openai/gpt-oss-120b",
]
const MAX_REQUESTS_PER_MINUTE = 12
const MAX_TOKENS_PER_MINUTE = 12_000
const MAX_TOKENS_PER_DAY = 200_000
let cachedAvailableModels = null

function isChatModel(model) {
  return !/(whisper|speech|audio|guard|embedding)/i.test(model)
}

function unique(models) {
  return [...new Set(models.filter(Boolean))]
}

async function getModels(apiKey, quality = "high", refresh = false) {
  if (refresh) cachedAvailableModels = null
  const preferred = quality === "fast" ? FAST_MODELS : HIGH_QUALITY_MODELS

  if (!cachedAvailableModels) {
    try {
      const response = await fetch(`${GROQ_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      const data = await response.json().catch(() => ({}))
      const discovered = data.data?.map(model => model.id).filter(isChatModel) || []
      if (response.ok && discovered.length) cachedAvailableModels = discovered
    } catch {
      // Directly probe known models below when model discovery is unavailable.
    }
  }

  const configuredModel = process.env.GROQ_MODEL
  if (!cachedAvailableModels) return unique([configuredModel, ...preferred])

  // A configured model is a preference, not a single point of failure.
  return unique([
    configuredModel,
    ...preferred.filter(model => cachedAvailableModels.includes(model)),
    ...cachedAvailableModels.filter(model => !preferred.includes(model)),
  ])
}

function canFailOver(status) {
  return [400, 403, 404, 408, 409, 410, 422, 429].includes(status) || status >= 500
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ error: { message: "Method not allowed" } })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return response.status(500).json({ error: { message: "Server is missing GROQ_API_KEY." } })
  if (!requestOriginAllowed(request)) return response.status(403).json({ error: { message: "Request origin is not allowed." } })

  const { messages, maxTokens = 1500, quality = "high", reasoningEffort = "medium" } = request.body || {}
  if (!validateChatMessages(messages)
    || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1500
    || !["fast", "high"].includes(quality)
    || !["low", "medium", "high"].includes(reasoningEffort)) {
    return response.status(400).json({ error: { message: "Invalid chat request." } })
  }

  const estimatedTokens = estimateTokens(messages, maxTokens)
  const limit = await consumeRateLimit(request, {
    scope: "chat",
    counters: [
      { name: "requests-minute", cost: 1, limit: MAX_REQUESTS_PER_MINUTE, windowSeconds: 60, message: "Rate limit reached. Please try again in a minute." },
      { name: "tokens-minute", cost: estimatedTokens, limit: MAX_TOKENS_PER_MINUTE, windowSeconds: 60, message: "Token limit reached. Please try again in a minute." },
      { name: "tokens-day", cost: estimatedTokens, limit: MAX_TOKENS_PER_DAY, windowSeconds: 86_400, message: "The shared daily token limit has been reached. Please try again tomorrow." },
    ],
  })
  if (!limit.allowed) return sendLimitResponse(response, limit)

  const attemptedModels = new Set()
  let lastStatus = 503
  let lastData = { error: { message: "No accessible Groq model is available." } }

  // The second pass refreshes Groq's model list in case the cached selection was
  // retired while this server instance was warm.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const model of await getModels(apiKey, quality, pass === 1)) {
      if (attemptedModels.has(model)) continue
      attemptedModels.add(model)

      try {
        const modelOptions = model.startsWith("openai/gpt-oss-") ? { reasoning_effort: reasoningEffort } : {}
        const groqResponse = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens, ...modelOptions }),
        })
        const data = await groqResponse.json().catch(() => ({}))
        if (groqResponse.ok) return response.status(200).json(data)

        lastStatus = groqResponse.status
        lastData = data
        if (!canFailOver(groqResponse.status)) return response.status(groqResponse.status).json(data)
      } catch {
        lastStatus = 502
        lastData = { error: { message: `Model ${model} is temporarily unreachable.` } }
      }
    }
  }

  cachedAvailableModels = null
  return response.status(lastStatus).json(lastData)
}
