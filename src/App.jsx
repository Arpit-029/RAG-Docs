// DocMind - frontend version
// uses groq api directly from browser, pdfjs for extraction

import { useState, useRef, useEffect } from "react"
import * as pdfjsLib from "pdfjs-dist"
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// split text into overlapping chunks
function chunkText(text, size = 400, overlap = 60) {
  const words = text.split(/\s+/).filter(Boolean)
  const out = []
  let i = 0
  while (i < words.length) {
    out.push(words.slice(i, i + size).join(" "))
    i += size - overlap
  }
  return out
}

// basic keyword scoring to find relevant chunks
// not as good as embeddings but works fine for most cases
function scoreChunk(chunk, query) {
  const qwords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const lower = chunk.toLowerCase()
  let score = 0
  for (const w of qwords) {
    const hits = lower.match(new RegExp(w, "g"))
    if (hits) score += hits.length
  }
  return score
}

function getTopChunks(chunks, query, n = 5) {
  return [...chunks]
    .map((c, idx) => ({ c, s: scoreChunk(c, query), idx }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(x => x.c)
}

// groq api call - using openai compatible endpoint
async function callGroq(key, messages, maxTokens = 1500) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

const MODES = ["💬 Chat", "📋 Bullets", "⚡ Quick", "🎓 Simple", "🔍 Deep"]

const modePrompts = {
  "💬 Chat": "Be conversational, friendly and thorough.",
  "📋 Bullets": "Always respond using bullet points.",
  "⚡ Quick": "Keep answer to 2-3 sentences max.",
  "🎓 Simple": "Explain like teaching a beginner, use analogies.",
  "🔍 Deep": "Give a detailed analytical response with nuance.",
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("dm_groq_key") || "")
  const [keyDraft, setKeyDraft] = useState("")

  // list of loaded docs: { name, chunks, pages, summary }
  const [docs, setDocs] = useState([])
  const [activeDoc, setActiveDoc] = useState(null)

  const [messages, setMessages] = useState([])
  const [inputVal, setInputVal] = useState("")
  const [mode, setMode] = useState("💬 Chat")
  const [loading, setLoading] = useState(false)
  const [indexing, setIndexing] = useState(false)

  const [showSrc, setShowSrc] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [chips, setChips] = useState([])
  const [dragOn, setDragOn] = useState(false)

  const fileInputRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  function saveKey() {
    if (!keyDraft.trim()) return
    localStorage.setItem("dm_groq_key", keyDraft.trim())
    setApiKey(keyDraft.trim())
    setKeyDraft("")
  }

  async function parsePDF(file) {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    let text = ""
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      text += content.items.map(i => i.str).join(" ") + "\n"
    }
    return { text, pages: pdf.numPages }
  }

  async function processFiles(files) {
    if (!apiKey) { alert("Add your Groq API key first"); return }
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf")
    if (!pdfs.length) return

    setIndexing(true)
    for (const file of pdfs) {
      if (docs.find(d => d.name === file.name)) continue

      try {
        const { text, pages } = await parsePDF(file)
        const chunks = chunkText(text)

        const summary = await callGroq(apiKey, [{
          role: "user",
          content: `Summarise this in 5 bullet points. Specific and concise.\n\n${text.slice(0, 2500)}\n\nOnly bullet points:`
        }], 400)

        const newDoc = { name: file.name, chunks, pages, summary }
        setDocs(prev => {
          const updated = [...prev, newDoc]
          return updated
        })
        setActiveDoc(file.name)
        setMessages([])
        setChips([])
      } catch (err) {
        alert(`Failed to process ${file.name}: ${err.message}`)
        console.error(err)
      }
    }
    setIndexing(false)
  }

  async function send(text) {
    if (!text?.trim() || loading || !activeDoc) return
    const doc = docs.find(d => d.name === activeDoc)
    if (!doc) return

    const userMsg = { role: "user", content: text }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInputVal("")
    setChips([])
    setLoading(true)

    try {
      // blend recent history into query for better chunk retrieval
      const recentText = updated.slice(-5).map(m => m.content).join(" ")
      const topChunks = getTopChunks(doc.chunks, `${recentText} ${text}`)
      const ctx = topChunks.map((c, i) => `[${i + 1}]: ${c}`).join("\n\n---\n\n")

      const sys = `You are DocMind, a document assistant. Currently analysing: ${activeDoc}.
Response style: ${modePrompts[mode]}
Rules:
- Answer based on the provided context.
- For follow-ups like "explain more" or "go deeper" — expand on the previous response.
- If the topic isn't in the context, say so but still try to be helpful.
- Don't make stuff up.`

      // build message history for groq
      // inject context into the last user message only
      const groqMsgs = [
        { role: "system", content: sys },
        ...updated.slice(-20, -1).map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: `Context from document:\n${ctx}\n\nQuestion: ${text}` }
      ]

      const reply = await callGroq(apiKey, groqMsgs)
      setMessages(prev => [...prev, { role: "assistant", content: reply, sources: topChunks }])

      // fire off followup suggestions without blocking
      callGroq(apiKey, [{
        role: "user",
        content: `Give 3 short follow-up questions as a JSON array. Nothing else.\nQ: ${text}\nA: ${reply.slice(0, 300)}\nFormat: ["q1?","q2?","q3?"]`
      }], 120).then(raw => {
        try {
          const parsed = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1))
          setChips(parsed)
        } catch {
          // doesn't matter if this fails
        }
      }).catch(() => {})

    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Something went wrong: ${err.message}`
      }])
    }

    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(inputVal)
    }
  }

  // ---------- API KEY SCREEN ----------
  if (!apiKey) {
    return (
      <div style={S.page}>
        <div style={S.keyScreen}>
          <div style={S.bigLogo}>🧠</div>
          <div style={S.keyTitle}>DocMind</div>
          <p style={S.keyDesc}>
            Enter your Groq API key to get started.{" "}
            <a href="https://console.groq.com/keys" target="_blank" style={{ color: "#7ee8a2" }}>
              Get one free →
            </a>
          </p>
          <input
            style={S.keyInput}
            type="password"
            placeholder="gsk_..."
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveKey()}
            autoFocus
          />
          <button style={S.keyBtn} onClick={saveKey}>Continue →</button>
          <p style={{ fontSize: "0.7rem", color: "#334455", marginTop: "12px" }}>
            Key stored in your browser only.
          </p>
        </div>
      </div>
    )
  }

  // ---------- MAIN APP ----------
  const currentDoc = docs.find(d => d.name === activeDoc)

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* header bar */}
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span style={S.logo}>🧠 DocMind</span>
            <span style={S.logoSub}>chat with PDFs</span>
          </div>
          <button
            style={S.iconBtn}
            title="Change API key"
            onClick={() => { if (confirm("Reset API key?")) { localStorage.removeItem("dm_groq_key"); setApiKey("") }}}
          >
            🔑
          </button>
        </div>

        {/* upload drop zone */}
        <div
          style={{ ...S.dropzone, ...(dragOn ? S.dropActive : {}) }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOn(true) }}
          onDragLeave={() => setDragOn(false)}
          onDrop={e => { e.preventDefault(); setDragOn(false); processFiles(e.dataTransfer.files) }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            hidden
            onChange={e => processFiles(e.target.files)}
          />
          {indexing
            ? <span style={S.dropTxt}>⏳ Indexing PDF...</span>
            : <span style={S.dropTxt}>📎 Drop PDF or <span style={{ color: "#7ee8a2" }}>click to upload</span></span>
          }
        </div>

        {/* doc tabs if multiple docs loaded */}
        {docs.length > 0 && (
          <div style={S.tabRow}>
            {docs.map(d => (
              <button
                key={d.name}
                style={{ ...S.tab, ...(d.name === activeDoc ? S.tabActive : {}) }}
                onClick={() => { setActiveDoc(d.name); setMessages([]); setChips([]) }}
              >
                📄 {d.name.length > 20 ? d.name.slice(0, 20) + "…" : d.name}
              </button>
            ))}
          </div>
        )}

        {/* controls - only show when a doc is loaded */}
        {currentDoc && (
          <div style={S.controls}>
            <select
              style={S.select}
              value={mode}
              onChange={e => setMode(e.target.value)}
            >
              {MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <button
              style={{ ...S.iconBtn, ...(showSrc ? S.iconBtnOn : {}) }}
              onClick={() => setShowSrc(s => !s)}
              title="Toggle source chunks"
            >
              🔍
            </button>

            <button
              style={{ ...S.iconBtn, ...(showSummary ? S.iconBtnOn : {}) }}
              onClick={() => setShowSummary(s => !s)}
              title="Document summary"
            >
              📋
            </button>

            <button
              style={S.iconBtn}
              onClick={() => { setMessages([]); setChips([]) }}
              title="Clear chat"
            >
              🗑️
            </button>

            {messages.length > 0 && (
              <button
                style={S.iconBtn}
                title="Export chat"
                onClick={() => {
                  const lines = [`# DocMind – ${activeDoc}`, `Date: ${new Date().toLocaleString()}`, "---", ""]
                  messages.forEach(m => {
                    if (m.role === "user") lines.push(`**You:** ${m.content}\n`)
                    else if (m.role === "assistant") lines.push(`**DocMind:** ${m.content}\n`)
                  })
                  const blob = new Blob([lines.join("\n")], { type: "text/markdown" })
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = `docmind-${Date.now()}.md`
                  a.click()
                }}
              >
                💾
              </button>
            )}
          </div>
        )}

        {/* summary panel */}
        {showSummary && currentDoc && (
          <div style={S.summaryPanel}>
            <div style={S.summaryHead}>📋 {currentDoc.name} · {currentDoc.pages}p · {currentDoc.chunks} chunks</div>
            <div style={{ fontSize: "0.82rem", lineHeight: "1.7", whiteSpace: "pre-wrap", color: "#c0cce0" }}>
              {currentDoc.summary}
            </div>
          </div>
        )}

        {/* divider */}
        {currentDoc && <div style={S.divider} />}

        {/* chat messages area */}
        <div style={S.chatArea}>
          {!currentDoc && (
            <div style={S.empty}>
              <div style={{ fontSize: "2.5rem", marginBottom: "10px" }}>🧠</div>
              <div style={{ color: "#7ee8a2", fontWeight: 600, marginBottom: "6px" }}>DocMind</div>
              <div style={{ color: "#334455", fontSize: "0.83rem" }}>Upload a PDF above to start chatting</div>
            </div>
          )}

          {currentDoc && messages.length === 0 && (
            <div style={S.empty}>
              Ask anything about <b style={{ color: "#7ee8a2" }}>{activeDoc}</b>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{ ...S.row, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}
            >
              <div style={{ ...S.bubble, ...(msg.role === "user" ? S.userBubble : S.botBubble) }}>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.65" }}>{msg.content}</div>
                {showSrc && msg.role === "assistant" && msg.sources?.map((src, si) => (
                  <div key={si} style={S.srcBox}>
                    📌 {si + 1}: {src.slice(0, 200)}{src.length > 200 ? "…" : ""}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ ...S.row, justifyContent: "flex-start" }}>
              <div style={{ ...S.bubble, ...S.botBubble }}>
                <span style={S.dots}>● ● ●</span>
              </div>
            </div>
          )}

          {chips.length > 0 && !loading && (
            <div style={{ margin: "4px 0 8px" }}>
              <div style={{ fontSize: "0.68rem", color: "#334455", marginBottom: "5px" }}>💡 Follow-ups</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {chips.map((q, i) => (
                  <button key={i} style={S.chip} onClick={() => send(q)}>
                    {q.length > 48 ? q.slice(0, 48) + "…" : q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* input — fixed to bottom */}
        {currentDoc && (
          <div style={S.inputBar}>
            <input
              ref={inputRef}
              style={S.input}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything..."
              disabled={loading}
            />
            <button
              style={{ ...S.sendBtn, opacity: loading ? 0.45 : 1 }}
              onClick={() => send(inputVal)}
              disabled={loading}
            >
              ↑
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// all styles in one place - easier to tweak
const S = {
  page: {
    minHeight: "100vh",
    background: "#0f1117",
    display: "flex",
    justifyContent: "center",
  },
  wrap: {
    width: "100%",
    maxWidth: "700px",
    display: "flex",
    flexDirection: "column",
    padding: "14px 14px 90px",
    gap: "10px",
  },

  // header
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #1e2535",
    paddingBottom: "12px",
  },
  logo: { fontSize: "1.15rem", fontWeight: 700, color: "#7ee8a2" },
  logoSub: { fontSize: "0.72rem", color: "#334455" },

  // upload
  dropzone: {
    border: "1.5px dashed #2a3a50",
    borderRadius: "10px",
    padding: "18px",
    textAlign: "center",
    cursor: "pointer",
    background: "#161b27",
    transition: "border-color 0.15s, background 0.15s",
  },
  dropActive: { borderColor: "#7ee8a2", background: "#192435" },
  dropTxt: { fontSize: "0.83rem", color: "#4a5a70" },

  // doc tabs
  tabRow: { display: "flex", flexWrap: "wrap", gap: "5px" },
  tab: {
    background: "#161b27",
    border: "1px solid #1e2535",
    borderRadius: "18px",
    padding: "3px 12px",
    fontSize: "0.73rem",
    color: "#6677aa",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  tabActive: { borderColor: "#7ee8a2", color: "#7ee8a2" },

  // controls
  controls: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  select: {
    flex: 1,
    minWidth: "130px",
    background: "#161b27",
    border: "1px solid #1e2535",
    borderRadius: "8px",
    color: "#d0dae8",
    padding: "5px 8px",
    fontSize: "0.78rem",
    cursor: "pointer",
    outline: "none",
  },
  iconBtn: {
    background: "#161b27",
    border: "1px solid #1e2535",
    borderRadius: "8px",
    color: "#7ee8a2",
    padding: "5px 10px",
    fontSize: "0.8rem",
    cursor: "pointer",
    transition: "all 0.12s",
  },
  iconBtnOn: {
    background: "#1a2e1a",
    borderColor: "#7ee8a2",
  },

  // summary
  summaryPanel: {
    background: "#161b27",
    border: "1px solid #1e2535",
    borderRadius: "10px",
    padding: "12px 14px",
  },
  summaryHead: {
    fontSize: "0.78rem",
    color: "#7ee8a2",
    fontWeight: 600,
    marginBottom: "8px",
  },

  divider: { borderTop: "1px solid #1e2535" },

  // chat
  chatArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    minHeight: "150px",
  },
  empty: {
    textAlign: "center",
    padding: "50px 0 20px",
    color: "#334455",
    fontSize: "0.85rem",
  },
  row: { display: "flex" },
  bubble: {
    maxWidth: "82%",
    padding: "10px 13px",
    borderRadius: "12px",
    fontSize: "0.875rem",
  },
  userBubble: {
    background: "#1a2535",
    border: "1px solid #252f45",
    borderBottomRightRadius: "3px",
    color: "#e0eaf8",
  },
  botBubble: {
    background: "#161b27",
    border: "1px solid #1e2535",
    borderBottomLeftRadius: "3px",
    color: "#d0dae8",
  },
  srcBox: {
    marginTop: "8px",
    borderLeft: "2px solid #7ee8a2",
    paddingLeft: "8px",
    fontSize: "0.68rem",
    color: "#556677",
    fontFamily: "monospace",
    lineHeight: "1.5",
  },
  dots: {
    color: "#7ee8a2",
    fontSize: "1rem",
    letterSpacing: "4px",
    animation: "none",
  },

  // followup chips
  chip: {
    background: "#161b27",
    border: "1px solid #1e2535",
    borderRadius: "18px",
    color: "#7788aa",
    padding: "3px 10px",
    fontSize: "0.71rem",
    cursor: "pointer",
    transition: "all 0.12s",
  },

  // input bar
  inputBar: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: "700px",
    display: "flex",
    gap: "8px",
    padding: "10px 14px",
    background: "#0f1117",
    borderTop: "1px solid #1a2535",
    zIndex: 99,
  },
  input: {
    flex: 1,
    background: "#161b27",
    border: "1px solid #252f45",
    borderRadius: "10px",
    color: "#f0f2f6",
    padding: "10px 13px",
    fontSize: "0.875rem",
    outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    background: "#7ee8a2",
    border: "none",
    borderRadius: "10px",
    color: "#0f1117",
    width: "42px",
    fontSize: "1.1rem",
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },

  // key screen
  keyScreen: {
    margin: "auto",
    textAlign: "center",
    maxWidth: "360px",
    padding: "40px 20px",
  },
  bigLogo: { fontSize: "3rem", marginBottom: "8px" },
  keyTitle: { fontSize: "1.4rem", fontWeight: 700, color: "#7ee8a2", marginBottom: "10px" },
  keyDesc: { fontSize: "0.82rem", color: "#4a5a70", lineHeight: "1.6", marginBottom: "20px" },
  keyInput: {
    width: "100%",
    background: "#161b27",
    border: "1px solid #252f45",
    borderRadius: "10px",
    color: "#f0f2f6",
    padding: "10px 14px",
    fontSize: "0.875rem",
    outline: "none",
    marginBottom: "10px",
    fontFamily: "inherit",
  },
  keyBtn: {
    width: "100%",
    background: "#7ee8a2",
    border: "none",
    borderRadius: "10px",
    color: "#0f1117",
    padding: "10px",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
}
