const STOP_WORDS = new Set([
  "about", "after", "also", "been", "before", "being", "between", "could", "does", "from", "have", "into",
  "more", "most", "only", "other", "should", "than", "that", "their", "there", "these", "they", "this", "those",
  "through", "what", "when", "where", "which", "while", "with", "would", "your", "please", "explain", "tell",
])

const BROAD_QUESTION = /\b(summary|summari[sz]e|overview|main (idea|ideas|point|points|topic|topics)|what is this|document about)\b/i

function terms(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
}

export function chunkPages(pageTexts, size = 320, overlap = 55) {
  const chunks = []

  pageTexts.forEach((pageText, pageIndex) => {
    const words = pageText.split(/\s+/).filter(Boolean)
    for (let start = 0; start < words.length; start += size - overlap) {
      chunks.push({ text: words.slice(start, start + size).join(" "), page: pageIndex + 1 })
    }
  })

  return chunks
}

// Kept for callers that have plain text rather than page-separated content.
export function chunkText(text, size = 320, overlap = 55) {
  return chunkPages([text], size, overlap)
}

function scoreChunk(chunk, queryTerms, phrase) {
  const chunkTerms = terms(chunk.text)
  const frequencies = new Map()
  chunkTerms.forEach(term => frequencies.set(term, (frequencies.get(term) || 0) + 1))

  let score = queryTerms.reduce((total, term) => {
    const frequency = frequencies.get(term) || 0
    return total + (frequency ? 1 + Math.log(frequency) : 0)
  }, 0)

  if (phrase.length > 8 && chunk.text.toLowerCase().includes(phrase)) score += 8
  return score / Math.sqrt(Math.max(chunkTerms.length, 1))
}

function representativeChunks(chunks, count) {
  if (chunks.length <= count) return chunks
  const indexes = new Set(Array.from({ length: count }, (_, index) => Math.round(index * (chunks.length - 1) / (count - 1))))
  return [...indexes].map(index => chunks[index])
}

export function getTopChunks(chunks, query, count = 6, fallbackToRepresentative = true) {
  if (!chunks.length) return []
  if (BROAD_QUESTION.test(query)) return representativeChunks(chunks, count)

  const queryTerms = [...new Set(terms(query))]
  const phrase = query.trim().toLowerCase()
  const ranked = chunks
    .map((chunk, index) => ({ chunk, score: scoreChunk(chunk, queryTerms, phrase), index }))
    .sort((first, second) => second.score - first.score || first.index - second.index)

  if (!ranked[0]?.score) return fallbackToRepresentative ? representativeChunks(chunks, count) : []

  const selected = []
  const pagesUsed = new Map()
  for (const result of ranked) {
    const pageUses = pagesUsed.get(result.chunk.page) || 0
    if (pageUses >= 2) continue
    selected.push(result.chunk)
    pagesUsed.set(result.chunk.page, pageUses + 1)
    if (selected.length === count) break
  }
  return selected
}

export function getTopChunksForQueries(chunks, queries, count = 7) {
  const scores = new Map()

  queries.filter(Boolean).forEach((query, queryIndex) => {
    const results = getTopChunks(chunks, query, Math.min(count * 2, 12), false)
    results.forEach((chunk, rank) => {
      // The user's original wording receives extra weight; generated searches
      // add vocabulary and alternative phrasings without replacing user intent.
      const weight = queryIndex === 0 ? 2 : 1
      scores.set(chunk, (scores.get(chunk) || 0) + weight / (rank + 1))
    })
  })

  if (!scores.size) return representativeChunks(chunks, count)

  return [...scores.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, count)
    .map(([chunk]) => chunk)
}
