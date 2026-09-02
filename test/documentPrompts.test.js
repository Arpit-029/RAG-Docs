import test from "node:test"
import assert from "node:assert/strict"
import { buildFallbackSearchQueries, buildSearchPlanMessages } from "../src/utils/documentPrompts.js"

const conversation = [
  { role: "user", content: "What are the two recommended approaches?" },
  { role: "assistant", content: "The document recommends retrieval caching first and query expansion second." },
]

test("search planning includes assistant answers needed to resolve follow-ups", () => {
  const messages = buildSearchPlanMessages("guide.pdf", conversation, "Explain the second one")

  assert.match(messages[1].content, /Assistant: The document recommends retrieval caching first and query expansion second\./)
  assert.match(messages[1].content, /Current question: Explain the second one/)
})

test("fallback retrieval combines the current follow-up with recent chat context", () => {
  const queries = buildFallbackSearchQueries(conversation, "Explain the second one")

  assert.equal(queries[0], "Explain the second one")
  assert.match(queries[1], /query expansion second/)
  assert.match(queries[1], /Current question: Explain the second one/)
})
