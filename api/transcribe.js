import { consumeRateLimit, sendLimitResponse } from "../server/rateLimit.js"
import { requestOriginAllowed } from "../server/requestGuards.js"

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
const MAX_AUDIO_BYTES = 10 * 1024 * 1024

export const config = { api: { bodyParser: false } }

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ error: { message: "Method not allowed" } })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return response.status(500).json({ error: { message: "Server is missing GROQ_API_KEY." } })
  if (!requestOriginAllowed(request)) return response.status(403).json({ error: { message: "Request origin is not allowed." } })

  const contentType = request.headers["content-type"] || ""
  const contentLength = Number(request.headers["content-length"] || 0)
  if (!contentType.startsWith("multipart/form-data")) {
    return response.status(415).json({ error: { message: "Expected multipart audio." } })
  }
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_AUDIO_BYTES) {
    return response.status(413).json({ error: { message: "Voice recordings must be 10 MB or smaller." } })
  }

  const limit = await consumeRateLimit(request, {
    scope: "transcription",
    counters: [
      { name: "requests-minute", cost: 1, limit: 8, windowSeconds: 60, message: "Voice limit reached. Try again in a minute." },
      { name: "bytes-day", cost: contentLength, limit: 25 * 1024 * 1024, windowSeconds: 86_400, message: "Daily voice limit reached. Try again tomorrow." },
    ],
  })
  if (!limit.allowed) return sendLimitResponse(response, limit)

  try {
    const upstream = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": contentType,
      },
      body: request,
      duplex: "half",
    })
    const body = await upstream.text()
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json")
    return response.status(upstream.status).send(body)
  } catch {
    return response.status(502).json({ error: { message: "The transcription service is temporarily unreachable." } })
  }
}
