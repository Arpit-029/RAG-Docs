export function chunkText(text, size = 400, overlap = 60) {
  // Overlap keeps sentences near a chunk boundary available in both chunks.
  const words = text.split(/\s+/).filter(Boolean)
  const chunks = []

  for (let start = 0; start < words.length; start += size - overlap) {
    chunks.push(words.slice(start, start + size).join(" "))
  }

  return chunks
}

function scoreChunk(chunk, query) {
  // A simple word-match score is enough for this small in-browser document search.
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2)
  const lowerCaseChunk = chunk.toLowerCase()

  return queryWords.reduce((score, word) => {
    const hits = lowerCaseChunk.match(new RegExp(word, "g"))
    return score + (hits?.length || 0)
  }, 0)
}

export function getTopChunks(chunks, query, count = 5) {
  // Return only the text of the best matches, in relevance order.
  return [...chunks]
    .map((chunk, index) => ({ chunk, score: scoreChunk(chunk, query), index }))
    .sort((first, second) => second.score - first.score)
    .slice(0, count)
    .map(result => result.chunk)
}
