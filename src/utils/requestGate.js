export function createRequestGate() {
  let generation = 0
  let controller = null

  return {
    begin() {
      controller?.abort()
      controller = new AbortController()
      generation += 1
      return { id: generation, signal: controller.signal }
    },
    cancel() {
      generation += 1
      controller?.abort()
      controller = null
    },
    finish(id) {
      if (id === generation) controller = null
    },
    isCurrent(id) {
      return id === generation && !controller?.signal.aborted
    },
  }
}
