import { useEffect, useRef, useState } from "react"
import { modePrompts } from "../constants/chatModes"
import { callGroq, MANAGED_GROQ_KEY } from "../services/groq"
import { loadActiveDocument, saveActiveDocument } from "../services/documentStore"
import { parsePdf } from "../services/pdf"
import { isPdfFile, validatePdfFile } from "../utils/pdfLimits"
import { createRequestGate } from "../utils/requestGate"
import { getTopChunks, getTopChunksForQueries, chunkPages } from "../utils/documentSearch"
import { buildAnswerMessages, buildFollowUpMessages, buildSearchPlanMessages, buildSummaryMessages } from "../utils/documentPrompts"

const EMPTY_CONVERSATION = Object.freeze({ messages: [], followUpQuestions: [] })

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
  const [conversationsByDocument, setConversationsByDocument] = useState({})
  const [inputValue, setInputValue] = useState("")
  const [mode, setMode] = useState("Chat")
  const [loading, setLoading] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [restoringDocument, setRestoringDocument] = useState(true)
  const [processingDocument, setProcessingDocument] = useState(null)
  const [showSources, setShowSources] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const answerGateRef = useRef(createRequestGate())
  const followUpGateRef = useRef(createRequestGate())

  const activeDocument = documents.find(document => document.name === activeDocumentName)
  const activeConversation = conversationsByDocument[activeDocumentName] || EMPTY_CONVERSATION
  const messages = activeConversation.messages
  const followUpQuestions = activeConversation.followUpQuestions

  useEffect(() => {
    let cancelled = false

    loadActiveDocument()
      .then(document => {
        if (cancelled || !document) return
        setDocuments([document])
        setActiveDocumentName(document.name)
      })
      .catch(error => console.error("Failed to restore the saved PDF", error))
      .finally(() => {
        if (!cancelled) setRestoringDocument(false)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    // Keep the latest reply visible as new messages arrive.
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => () => {
    answerGateRef.current.cancel()
    followUpGateRef.current.cancel()
  }, [])

  function updateConversation(documentName, update) {
    if (!documentName) return
    setConversationsByDocument(previous => {
      const current = previous[documentName] || EMPTY_CONVERSATION
      return { ...previous, [documentName]: update(current) }
    })
  }

  function cancelPendingRequests() {
    answerGateRef.current.cancel()
    followUpGateRef.current.cancel()
  }

  function clearChat(documentName = activeDocumentName) {
    cancelPendingRequests()
    setLoading(false)
    updateConversation(documentName, () => EMPTY_CONVERSATION)
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
    cancelPendingRequests()
    setLoading(false)
    setActiveDocumentName(name)
  }

  async function processFiles(files) {
    if (restoringDocument || indexing) return
    if (!apiKey) {
      alert("Add your Groq API key first")
      return
    }

    // Ignore files that are not PDFs because the parser only supports PDFs.
    const file = Array.from(files).find(isPdfFile)
    if (!file) {
      alert("Choose a PDF file.")
      return
    }
    try {
      validatePdfFile(file)
    } catch (error) {
      alert(error.message)
      return
    }

    cancelPendingRequests()
    setLoading(false)
    setIndexing(true)
    try {
      setProcessingDocument({ name: file.name, stage: "reading" })
      const { pageTexts, pages } = await parsePdf(file)
      setProcessingDocument({ name: file.name, stage: "extracting" })
      const chunks = chunkPages(pageTexts)
      if (!chunks.length) throw new Error("No readable text was found in this PDF.")

      // Representative excerpts make summaries useful for the whole document,
      // rather than only its opening pages.
      const summarySources = getTopChunks(chunks, "summary overview main topics", 8)
      setProcessingDocument({ name: file.name, stage: "preparing" })
      const summary = await callGroq(apiKey, buildSummaryMessages(file.name, summarySources), 650, {
        quality: "high",
        reasoningEffort: "medium",
      })
      const document = { name: file.name, chunks, pages, summary }

      // Persist first so a failed replacement never discards the previous PDF.
      await saveActiveDocument(document)
      setDocuments([document])
      setActiveDocumentName(file.name)
      clearChat(file.name)
    } catch (error) {
      alert(`Failed to process ${file.name}: ${error.message}`)
      console.error(error)
    }
    setProcessingDocument(null)
    setIndexing(false)
  }

  async function sendMessage(text) {
    if (!text?.trim() || loading || !activeDocument) return

    const documentName = activeDocumentName
    const document = activeDocument
    const userMessage = { role: "user", content: text }
    const conversation = [...messages, userMessage]
    updateConversation(documentName, () => ({ messages: conversation, followUpQuestions: [] }))
    setInputValue("")
    followUpGateRef.current.cancel()
    const request = answerGateRef.current.begin()
    setLoading(true)

    try {
      const priorConversation = conversation.slice(0, -1)
      const searchQueries = await planSearchQueries(apiKey, documentName, priorConversation, text, request.signal)
      if (!answerGateRef.current.isCurrent(request.id)) return
      const sourceChunks = getTopChunksForQueries(document.chunks, searchQueries)
      const answerMessages = buildAnswerMessages({
        documentName,
        modePrompt: modePrompts[mode],
        conversation: priorConversation,
        question: text,
        sources: sourceChunks,
      })
      const maxTokens = mode === "Quick" ? 300 : mode === "Deep" ? 1100 : mode === "Simple" ? 650 : 500
      const reply = await callGroq(apiKey, answerMessages, maxTokens, {
        quality: "high",
        reasoningEffort: mode === "Deep" ? "high" : "medium",
        signal: request.signal,
      })
      if (!answerGateRef.current.isCurrent(request.id)) return

      updateConversation(documentName, previous => ({
        ...previous,
        messages: [...previous.messages, { role: "assistant", content: reply, sources: sourceChunks }],
      }))
      loadFollowUpQuestions(documentName, text, reply)
    } catch (error) {
      if (error.name !== "AbortError" && answerGateRef.current.isCurrent(request.id)) {
        updateConversation(documentName, previous => ({
          ...previous,
          messages: [...previous.messages, { role: "assistant", content: `I couldn't complete that request. ${error.message}` }],
        }))
      }
    } finally {
      const isCurrent = answerGateRef.current.isCurrent(request.id)
      answerGateRef.current.finish(request.id)
      if (isCurrent) {
        setLoading(false)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    }
  }

  function loadFollowUpQuestions(documentName, question, reply) {
    // Follow-ups are optional, so a failure here must not interrupt the chat.
    const request = followUpGateRef.current.begin()
    callGroq(apiKey, buildFollowUpMessages(documentName, question, reply), 180, {
      quality: "fast",
      reasoningEffort: "low",
      signal: request.signal,
    })
      .then(rawResponse => {
        if (!followUpGateRef.current.isCurrent(request.id)) return
        try {
          const questions = JSON.parse(rawResponse.slice(rawResponse.indexOf("["), rawResponse.lastIndexOf("]") + 1))
          if (Array.isArray(questions)) {
            updateConversation(documentName, previous => ({
              ...previous,
              followUpQuestions: questions.filter(question => typeof question === "string").slice(0, 3),
            }))
          }
        } catch {
          // The response was not a valid JSON array, so do not show follow-ups.
        }
      })
      .catch(() => {})
      .finally(() => followUpGateRef.current.finish(request.id))
  }

  return {
    apiKey, isManagedKey, keyDraft, setKeyDraft, saveKey, resetKey,
    documents, activeDocumentName, activeDocument, selectDocument,
    messages, inputValue, setInputValue, mode, setMode, loading, indexing, restoringDocument, processingDocument,
    showSources, setShowSources, showSummary, setShowSummary,
    followUpQuestions, dragActive, setDragActive, processFiles, sendMessage, clearChat,
    fileInputRef, bottomRef, inputRef,
  }
}

async function planSearchQueries(apiKey, documentName, conversation, question, signal) {
  try {
    const rawResponse = await callGroq(
      apiKey,
      buildSearchPlanMessages(documentName, conversation, question),
      180,
      { quality: "fast", reasoningEffort: "low", signal },
    )
    const json = rawResponse.slice(rawResponse.indexOf("{"), rawResponse.lastIndexOf("}") + 1)
    const parsed = JSON.parse(json)
    const generatedQueries = Array.isArray(parsed.queries)
      ? parsed.queries.filter(query => typeof query === "string" && query.trim()).map(query => query.trim())
      : []
    return [...new Set([question.trim(), ...generatedQueries])].slice(0, 4)
  } catch (error) {
    if (error.name === "AbortError") throw error
    // Search planning improves difficult questions, but basic retrieval remains
    // available if the utility request is rate-limited or malformed.
    return [question.trim()]
  }
}
