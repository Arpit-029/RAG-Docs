// Vercel serverless endpoint. Keep GROQ_API_KEY server-side: never prefix it
// with VITE_ or send it to the browser.
const GROQ_BASE_URL = "https://api.groq.com/openai/v1"
// Keep this ordered by quality/cost preference. The actual choice is made from
// the models the deployment key can access, so retired models are skipped.
const PREFERRED_MODELS = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "qwen/qwen3.6-27b",
  "groq/compound-mini",
  "groq/compound",
]
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const MAX_REQUESTS_PER_MINUTE = 12
const MAX_TOKENS_PER_MINUTE = 12_000
const MAX_TOKENS_PER_DAY = 200_000
const buckets = new Map()
let cachedModels = null

function isChatModel(model) {
  return !/(whisper|speech|audio|guard|embedding)/i.test(model)
}

async function getModels(apiKey, refresh = false) {
  if (process.env.GROQ_MODEL) return [process.env.GROQ_MODEL]
  if (cachedModels && !refresh) return cachedModels

  const response = await fetch(`${GROQ_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const data = await response.json().catch(() => ({}))
  const available = data.data?.map(model => model.id).filter(isChatModel) || []
  if (!response.ok || !available.length) {
    throw new Error(data.error?.message || "No compatible Groq chat model is available for this key.")
  }

  // Prefer known text models, then try any other text-capable model returned by Groq.
  cachedModels = [...PREFERRED_MODELS.filter(model => available.includes(model)), ...available.filter(model => !PREFERRED_MODELS.includes(model))]
  return cachedModels
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

  const { messages, maxTokens = 1500 } = request.body || {}
  if (!Array.isArray(messages) || !messages.length || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1500) {
    return response.status(400).json({ error: { message: "Invalid chat request." } })
  }

  const estimatedTokens = estimateTokens(messages, maxTokens)
  if (!enforceLimit(request, response, estimatedTokens)) return

  try {
    let lastResponse
    let lastData
    for (const model of await getModels(apiKey)) {
      const groqResponse = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: maxTokens }),
      })
      const data = await groqResponse.json().catch(() => ({}))
      if (groqResponse.ok || process.env.GROQ_MODEL || ![400, 403, 404].includes(groqResponse.status)) {
        return response.status(groqResponse.status).json(data)
      }
      lastResponse = groqResponse
      lastData = data
    }
    cachedModels = null
    return response.status(lastResponse?.status || 503).json(lastData || { error: { message: "No accessible Groq model is available." } })
  } catch (error) {
    return response.status(502).json({ error: { message: error.message || "Unable to reach Groq. Please try again." } })
  }
}
