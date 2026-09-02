import test from "node:test"
import assert from "node:assert/strict"
import { mediaErrorMessage, normalizeVoiceLanguage, preferredAudioMimeType, recognitionErrorMessage } from "../src/utils/voice.js"

test("voice errors preserve actionable causes", () => {
  assert.match(recognitionErrorMessage("audio-capture"), /already in use/i)
  assert.match(recognitionErrorMessage("network"), /connection/i)
  assert.match(recognitionErrorMessage("unexpected"), /unexpected/)
  assert.match(mediaErrorMessage("NotFoundError"), /No microphone/i)
})

test("voice language rejects unknown values", () => {
  assert.equal(normalizeVoiceLanguage("hi"), "hi")
  assert.equal(normalizeVoiceLanguage("xx"), "")
})

test("audio format selection uses the first supported Groq format", () => {
  const Recorder = { isTypeSupported: type => type === "audio/mp4" }
  assert.equal(preferredAudioMimeType(Recorder), "audio/mp4")
})
