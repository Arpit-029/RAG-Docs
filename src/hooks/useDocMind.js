import { useEffect, useRef, useState } from "react"
import { modePrompts } from "../constants/chatModes"
import { callGroq, MANAGED_GROQ_KEY } from "../services/groq"
import { parsePdf } from "../services/pdf"
import { getTopChunks, getTopChunksForQueries, chunkPages } from "../utils/documentSearch"
import { buildAnswerMessages, buildFollowUpMessages, buildSearchPlanMessages, buildSummaryMessages } from "../utils/documentPrompts"

// Uses the deployment key first, then falls back to the key saved in this browser.
export function resolveInitialKey() {
  if (import.meta.env.VITE_USE_GROQ_PROXY === "true") return MANAGED_GROQ_KEY
  const environmentKey = import.meta.env.VITE_GROQ_KEY
  return environmentKey?.trim() || localStorage.getItem("dm_groq_key") || ""
}

export function useDocMind() {
  // UI state is kept here so page and component files only render the interface.
  const [apiKey, setApiKey] = useState(resolveInitialKey)
  const isManagedKey = apiKey === MANAGED_GROQ_KEY
  const [keyDraft, setKeyDraft] = useState("")
  const [documents, setDocuments] = useState([])
  const [activeDocumentName, setActiveDocumentName] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState("")
  const [mode, setMode] = useState("Chat")
  const [loading, setLoading] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [followUpQuestions, setFollowUpQuestions] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const activeDocument = documents.find(document => document.name === activeDocumentName)

  useEffect(() => {
    // Keep the latest reply visible as new messages arrive.
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  function clearChat() {
    setMessages([])
    setFollowUpQuestions([])
  }

  function saveKey() {
    const savedKey = keyDraft.trim()
    if (!savedKey) return

    localStorage.setItem("dm_groq_key", savedKey)
    setApiKey(savedKey)
    setKeyDraft("")
  }

  function resetKey() {
    if (isManagedKey) return
    if (confirm("Reset API key?")) {
      localStorage.removeItem("dm_groq_key")
      setApiKey("")
    }
  }

  function selectDocument(name) {
    setActiveDocumentName(name)
    clearChat()
  }

  async function processFiles(files) {
    if (!apiKey) {
      alert("Add your Groq API key first")
      return
    }

    // Ignore files that are not PDFs because the parser only supports PDFs.
    const pdfFiles = Array.from(files).filter(file => file.type === "application/pdf")
    if (!pdfFiles.length) return

    setIndexing(true)
    for (const file of pdfFiles) {
      if (documents.find(document => document.name === file.name)) continue

      try {
        const { pageTexts, pages } = await parsePdf(file)
        const chunks = chunkPages(pageTexts)
        if (!chunks.length) throw new Error("No readable text was found in this PDF.")

        // Representative excerpts make summaries useful for the whole document,
        // rather than only its opening pages.
        const summarySources = getTopChunks(chunks, "summary overview main topics", 8)
        const summary = await callGroq(apiKey, buildSummaryMessages(file.name, summarySources), 650, {
          quality: "high",
          reasoningEffort: "medium",
        })

        setDocuments(previousDocuments => [...previousDocuments, {
          name: file.name,
          chunks,
          pages,
          summary,
        }])
        setActiveDocumentName(file.name)
        clearChat()
      } catch (error) {
        alert(`Failed to process ${file.name}: ${error.message}`)
        console.error(error)
      }
    }
    setIndexing(false)
  }

  async function sendMessage(text) {
    if (!text?.trim() || loading || !activeDocument) return

    const userMessage = { role: "user", content: text }
    const conversation = [...messages, userMessage]
    setMessages(conversation)
    setInputValue("")
    setFollowUpQuestions([])
    setLoading(true)

    try {
      const priorConversation = conversation.slice(0, -1)
      const searchQueries = await planSearchQueries(apiKey, activeDocumentName, priorConversation, text)
      const sourceChunks = getTopChunksForQueries(activeDocument.chunks, searchQueries)
      const answerMessages = buildAnswerMessages({
        documentName: activeDocumentName,
        modePrompt: modePrompts[mode],
        conversation: priorConversation,
        question: text,
        sources: sourceChunks,
      })
      const maxTokens = mode === "Quick" ? 350 : mode === "Deep" ? 1400 : 900
      const reply = await callGroq(apiKey, answerMessages, maxTokens, {
        quality: "high",
        reasoningEffort: mode === "Deep" ? "high" : "medium",
      })

      setMessages(previousMessages => [...previousMessages, {
        role: "assistant",
        content: reply,
        sources: sourceChunks,
      }])
      loadFollowUpQuestions(text, reply)
    } catch (error) {
      setMessages(previousMessages => [...previousMessages, {
        role: "assistant",
        content: `I couldn't complete that request. ${error.message}`,
      }])
    }

    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function loadFollowUpQuestions(question, reply) {
    // Follow-ups are optional, so a failure here must not interrupt the chat.
    callGroq(apiKey, buildFollowUpMessages(activeDocumentName, question, reply), 180, {
      quality: "fast",
      reasoningEffort: "low",
    })
      .then(rawResponse => {
        try {
          const questions = JSON.parse(rawResponse.slice(rawResponse.indexOf("["), rawResponse.lastIndexOf("]") + 1))
          if (Array.isArray(questions)) setFollowUpQuestions(questions.filter(question => typeof question === "string").slice(0, 3))
        } catch {
          // The response was not a valid JSON array, so do not show follow-ups.
        }
      })
      .catch(() => {})
  }

  return {
    apiKey, isManagedKey, keyDraft, setKeyDraft, saveKey, resetKey,
    documents, activeDocumentName, activeDocument, selectDocument,
    messages, inputValue, setInputValue, mode, setMode, loading, indexing,
    showSources, setShowSources, showSummary, setShowSummary,
    followUpQuestions, dragActive, setDragActive, processFiles, sendMessage, clearChat,
    fileInputRef, bottomRef, inputRef,
  }
}

async function planSearchQueries(apiKey, documentName, conversation, question) {
  try {
    const rawResponse = await callGroq(
      apiKey,
      buildSearchPlanMessages(documentName, conversation, question),
      180,
      { quality: "fast", reasoningEffort: "low" },
    )
    const json = rawResponse.slice(rawResponse.indexOf("{"), rawResponse.lastIndexOf("}") + 1)
    const parsed = JSON.parse(json)
    const generatedQueries = Array.isArray(parsed.queries)
      ? parsed.queries.filter(query => typeof query === "string" && query.trim()).map(query => query.trim())
      : []
    return [...new Set([question.trim(), ...generatedQueries])].slice(0, 4)
  } catch {
    // Search planning improves difficult questions, but basic retrieval remains
    // available if the utility request is rate-limited or malformed.
    return [question.trim()]
  }
}
