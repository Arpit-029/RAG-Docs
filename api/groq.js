// Vercel serverless endpoint. Keep GROQ_API_KEY server-side: never prefix it
// with VITE_ or send it to the browser.
const GROQ_BASE_URL = "https://api.groq.com/openai/v1"
const MODEL = "llama-3.3-70b-versatile"
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const MAX_REQUESTS_PER_MINUTE = 12
const MAX_TOKENS_PER_MINUTE = 12_000
const MAX_TOKENS_PER_DAY = 200_000
const buckets = new Map()

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
    const groqResponse = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.4, max_tokens: maxTokens }),
    })
    const data = await groqResponse.json().catch(() => ({}))
    return response.status(groqResponse.status).json(data)
  } catch {
    return response.status(502).json({ error: { message: "Unable to reach Groq. Please try again." } })
  }
}
