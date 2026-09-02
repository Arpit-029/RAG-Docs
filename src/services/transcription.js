import { MANAGED_GROQ_KEY } from "./groq"

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
const TRANSCRIPTION_MODEL = "whisper-large-v3-turbo"
const MAX_AUDIO_BYTES = 10 * 1024 * 1024

function audioExtension(type = "") {
  if (type.includes("mp4")) return "m4a"
  if (type.includes("ogg")) return "ogg"
  if (type.includes("wav")) return "wav"
  return "webm"
}

export async function transcribeAudio(key, audio, language = "", signal) {
  if (!audio?.size) return ""
  if (audio.size > MAX_AUDIO_BYTES) throw new Error("Voice recording is too large. Keep questions under one minute.")

  const form = new FormData()
  form.append("file", audio, `question.${audioExtension(audio.type)}`)
  form.append("model", TRANSCRIPTION_MODEL)
  form.append("response_format", "json")
  if (language) form.append("language", language)

  const managed = key === MANAGED_GROQ_KEY
  const response = await fetch(managed ? "/api/transcribe" : GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: managed ? undefined : { Authorization: `Bearer ${key}` },
    body: form,
    signal,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message || `Transcription failed (${response.status})`)
  return data.text?.trim() || ""
}
