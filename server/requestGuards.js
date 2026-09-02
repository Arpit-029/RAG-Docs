export const MAX_CHAT_MESSAGES = 12
export const MAX_MESSAGE_CHARACTERS = 60_000
export const MAX_TOTAL_CHARACTERS = 120_000
export const MAX_SPEECH_CHARACTERS = 5_000

export function validateChatMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_CHAT_MESSAGES) return false

  let totalCharacters = 0
  for (const message of messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") return false
    if (!message.content.length || message.content.length > MAX_MESSAGE_CHARACTERS) return false
    totalCharacters += message.content.length
    if (totalCharacters > MAX_TOTAL_CHARACTERS) return false
  }
  return true
}

export function estimateTokens(messages, maxTokens) {
  const characters = messages.reduce((total, message) => total + message.content.length, 0)
  return Math.ceil(characters / 4) + maxTokens
}

export function validateSpeechText(text) {
  return typeof text === "string" && text.trim().length > 0 && text.length <= MAX_SPEECH_CHARACTERS
}

export function requestOriginAllowed(request) {
  if (process.env.VERCEL_ENV !== "production") return true
  const origin = request.headers.origin
  const host = request.headers["x-forwarded-host"] || request.headers.host
  if (!origin || !host) return false

  const configured = (process.env.AEOS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
  return configured.includes(origin)
    || origin === `https://${host}`
    || origin === `http://${host}`
}
