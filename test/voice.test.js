import test from "node:test"
import assert from "node:assert/strict"
import {
  mediaErrorMessage,
  normalizeVoiceLanguage,
  prepareTextForSpeech,
  preferredAudioMimeType,
  recognitionErrorMessage,
  SMOOTH_SPEECH_SETTINGS,
  updateSpeechEndDetector,
} from "../src/utils/voice.js"

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

test("spoken answers keep natural pauses while removing visual markup", () => {
  const answer = "## Summary\n\n- First point [S1, p. 3]\n- Second point {s1 , p. 5}\n- Read [the guide](https://example.com)."
  assert.equal(prepareTextForSpeech(answer), "Summary. First point, Second point, Read the guide.")
})

test("speech profile uses a calm natural pitch", () => {
  assert.ok(SMOOTH_SPEECH_SETTINGS.rate < 1)
  assert.equal(SMOOTH_SPEECH_SETTINGS.pitch, 1)
  assert.equal(SMOOTH_SPEECH_SETTINGS.volume, 1)
})

test("recording stops after speech is followed by a pause", () => {
  let detector = { speechDetected: false, lastSpeechAt: 0, shouldStop: false }
  detector = updateSpeechEndDetector(detector, 0.01, 500)
  assert.equal(detector.shouldStop, false)

  detector = updateSpeechEndDetector(detector, 0.08, 1_000)
  assert.equal(detector.speechDetected, true)

  detector = updateSpeechEndDetector(detector, 0.01, 2_599)
  assert.equal(detector.shouldStop, false)
  detector = updateSpeechEndDetector(detector, 0.01, 2_600)
  assert.equal(detector.shouldStop, true)
})

test("continued speech resets the automatic stop timer", () => {
  let detector = { speechDetected: true, lastSpeechAt: 1_000, shouldStop: false }
  detector = updateSpeechEndDetector(detector, 0.07, 2_000)
  detector = updateSpeechEndDetector(detector, 0.01, 3_599)
  assert.equal(detector.shouldStop, false)
})
