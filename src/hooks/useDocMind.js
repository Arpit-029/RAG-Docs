import { useEffect, useRef, useState } from "react"
import { modePrompts } from "../constants/chatModes"
import { callGroq, MANAGED_GROQ_KEY } from "../services/groq"
import { parsePdf } from "../services/pdf"
import { getTopChunks, chunkText } from "../utils/documentSearch"

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
        const { text, pages } = await parsePdf(file)
        // A summary is generated once, when the document is first uploaded.
        const summary = await callGroq(apiKey, [{
          role: "user",
          content: `Summarise this in 5 bullet points. Specific and concise.\n\n${text.slice(0, 2500)}\n\nOnly bullet points:`,
        }], 400)

        setDocuments(previousDocuments => [...previousDocuments, {
          name: file.name,
          chunks: chunkText(text),
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
      // Search using the current question and recent conversation for better context.
      const recentText = conversation.slice(-5).map(message => message.content).join(" ")
      const sourceChunks = getTopChunks(activeDocument.chunks, `${recentText} ${text}`)
      const context = sourceChunks.map((chunk, index) => `[${index + 1}]: ${chunk}`).join("\n\n---\n\n")
      const systemMessage = `You are DocMind, a document assistant. Currently analysing: ${activeDocumentName}.
Response style: ${modePrompts[mode]}
Rules:
- Answer based on the provided context.
- For follow-ups like "explain more" or "go deeper", expand on the previous response.
- If the topic isn't in the context, say so but still try to be helpful.
- Keep it concise and specific.
- keep it easy to understand, as if explaining to a 12-year-old.
- Don't make stuff up.`

      // Send only role and content to the API; UI-only fields such as sources are excluded.
      const reply = await callGroq(apiKey, [
        { role: "system", content: systemMessage },
        ...conversation.slice(-20, -1).map(message => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: `Context from document:\n${context}\n\nQuestion: ${text}` },
      ])

      setMessages(previousMessages => [...previousMessages, {
        role: "assistant",
        content: reply,
        sources: sourceChunks,
      }])
      loadFollowUpQuestions(text, reply)
    } catch (error) {
      setMessages(previousMessages => [...previousMessages, {
        role: "assistant",
        content: `Something went wrong: ${error.message}`,
      }])
    }

    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function loadFollowUpQuestions(question, reply) {
    // Follow-ups are optional, so a failure here must not interrupt the chat.
    callGroq(apiKey, [{
      role: "user",
      content: `Give 3 short follow-up questions as a JSON array. Nothing else.\nQ: ${question}\nA: ${reply.slice(0, 300)}\nFormat: ["q1?","q2?","q3?"]`,
    }], 120)
      .then(rawResponse => {
        try {
          const questions = JSON.parse(rawResponse.slice(rawResponse.indexOf("["), rawResponse.lastIndexOf("]") + 1))
          setFollowUpQuestions(questions)
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
