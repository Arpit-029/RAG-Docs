import test from "node:test"
import assert from "node:assert/strict"
import { createRequestGate } from "../src/utils/requestGate.js"

test("starting a request invalidates and aborts the previous request", () => {
  const gate = createRequestGate()
  const first = gate.begin()
  const second = gate.begin()

  assert.equal(first.signal.aborted, true)
  assert.equal(gate.isCurrent(first.id), false)
  assert.equal(gate.isCurrent(second.id), true)
})

test("cancelling a request prevents a stale completion", () => {
  const gate = createRequestGate()
  const request = gate.begin()
  gate.cancel()

  assert.equal(request.signal.aborted, true)
  assert.equal(gate.isCurrent(request.id), false)
})
