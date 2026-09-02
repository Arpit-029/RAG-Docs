import test from "node:test"
import assert from "node:assert/strict"
import { estimateTokens, MAX_CHAT_MESSAGES, MAX_SPEECH_CHARACTERS, validateChatMessages, validateSpeechText } from "../server/requestGuards.js"

test("chat validation accepts the application message shape", () => {
  assert.equal(validateChatMessages([{ role: "system", content: "rules" }, { role: "user", content: "question" }]), true)
})

test("chat validation rejects malformed and oversized conversations", () => {
  assert.equal(validateChatMessages([{ role: "tool", content: "unexpected" }]), false)
 
  const messages = Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => ({ role: "user", content: "question" }))
  assert.equal(validateChatMessages(messages), false)
})

test("token estimation includes requested output", () => {
  assert.equal(estimateTokens([{ role: "user", content: "12345678" }], 10), 12)
})

test("speech validation accepts useful text and rejects empty or oversized input", () => {
  assert.equal(validateSpeechText("Read this answer"), true)
  assert.equal(validateSpeechText("   "), false)
  assert.equal(validateSpeechText("x".repeat(MAX_SPEECH_CHARACTERS + 1)), false)
})
