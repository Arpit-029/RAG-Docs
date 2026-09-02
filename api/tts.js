import { consumeRateLimit, sendLimitResponse } from "../server/rateLimit.js"
import { requestOriginAllowed, validateSpeechText } from "../server/requestGuards.js"

const CLOUDFLARE_TTS_MODEL = "@cf/deepgram/aura-1"
const CLOUDFLARE_TTS_SPEAKER = "luna"
const MAX_FREE_CHARACTERS_PER_DAY = 7_000

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ error: { message: "Method not allowed" } })
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    return response.status(500).json({ error: { message: "Server is missing Cloudflare TTS credentials." } })
  }
  if (!requestOriginAllowed(request)) {
    return response.status(403).json({ error: { message: "Request origin is not allowed." } })
  }

  const text = request.body?.text?.trim()
  if (!validateSpeechText(text)) {
    return response.status(400).json({ error: { message: "Speech text must be between 1 and 5,000 characters." } })
  }

  const limit = await consumeRateLimit(request, {
    scope: "tts",
    counters: [
      { name: "requests-minute", cost: 1, limit: 8, windowSeconds: 60, message: "Speech limit reached. Try again in a minute." },
      { name: "characters-day", cost: text.length, limit: MAX_FREE_CHARACTERS_PER_DAY, windowSeconds: 86_400, message: "The free daily speech limit has been reached. Try again tomorrow." },
    ],
  })
  if (!limit.allowed) return sendLimitResponse(response, limit)

  try {
    const upstream = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CLOUDFLARE_TTS_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, speaker: CLOUDFLARE_TTS_SPEAKER, encoding: "mp3" }),
      },
    )

    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}))
      const message = data.errors?.[0]?.message || "Cloud speech is temporarily unavailable."
      return response.status(upstream.status).json({ error: { message } })
    }

    const audio = Buffer.from(await upstream.arrayBuffer())
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg")
    response.setHeader("Cache-Control", "private, no-store")
    return response.status(200).send(audio)
  } catch {
    return response.status(502).json({ error: { message: "Cloud speech is temporarily unreachable." } })
  }
}
