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
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const MAX_REQUESTS_PER_MINUTE = 12
const MAX_TOKENS_PER_MINUTE = 12_000
const MAX_TOKENS_PER_DAY = 200_000
const buckets = new Map()
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

function clientIp(request) {
  return request.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || request.headers["x-real-ip"]
    || "unknown"
}

function estimateTokens(messages, maxTokens) {
  const characters = messages.reduce((total, message) => total + (message.content?.length || 0), 0)
  return Math.ceil(characters / 4) + maxTokens
}

function limitResponse(response, retryAfterSeconds, message) {
  response.setHeader("Retry-After", String(retryAfterSeconds))
  return response.status(429).json({ error: { message } })
}

function enforceLimit(request, response, estimatedTokens) {
  const now = Date.now()
  const ip = clientIp(request)
  const bucket = buckets.get(ip) || { minuteStartedAt: now, dayStartedAt: now, requests: 0, minuteTokens: 0, dayTokens: 0 }

  if (now - bucket.minuteStartedAt >= MINUTE) {
    bucket.minuteStartedAt = now
    bucket.requests = 0
    bucket.minuteTokens = 0
  }
  if (now - bucket.dayStartedAt >= DAY) {
    bucket.dayStartedAt = now
    bucket.dayTokens = 0
  }

  if (bucket.requests + 1 > MAX_REQUESTS_PER_MINUTE || bucket.minuteTokens + estimatedTokens > MAX_TOKENS_PER_MINUTE) {
    return limitResponse(response, Math.ceil((bucket.minuteStartedAt + MINUTE - now) / 1000), "Rate limit reached. Please try again in a minute.")
  }
  if (bucket.dayTokens + estimatedTokens > MAX_TOKENS_PER_DAY) {
    return limitResponse(response, Math.ceil((bucket.dayStartedAt + DAY - now) / 1000), "The shared daily token limit has been reached. Please try again tomorrow.")
  }

  bucket.requests += 1
  bucket.minuteTokens += estimatedTokens
  bucket.dayTokens += estimatedTokens
  buckets.set(ip, bucket)
  return true
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ error: { message: "Method not allowed" } })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return response.status(500).json({ error: { message: "Server is missing GROQ_API_KEY." } })

  const { messages, maxTokens = 1500, quality = "high", reasoningEffort = "medium" } = request.body || {}
  if (!Array.isArray(messages) || !messages.length
    || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1500
    || !["fast", "high"].includes(quality)
    || !["low", "medium", "high"].includes(reasoningEffort)) {
    return response.status(400).json({ error: { message: "Invalid chat request." } })
  }

  const estimatedTokens = estimateTokens(messages, maxTokens)
  if (!enforceLimit(request, response, estimatedTokens)) return

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
          body: JSON.stringify({ model, messages, temperature: 0.35, max_tokens: maxTokens, ...modelOptions }),
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
