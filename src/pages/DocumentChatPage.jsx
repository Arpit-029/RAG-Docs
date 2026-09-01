import { useEffect, useRef } from "react"
import ChatControls from "../components/ChatControls"
import ChatConversation from "../components/ChatConversation"
import DocumentUploader from "../components/DocumentUploader"
import MessageInput from "../components/MessageInput"
import VoiceOrb from "../components/VoiceOrb"
import AppIcon from "../components/AppIcon"
import BrandMark from "../components/BrandMark"
import { useVoiceInteraction } from "../hooks/useVoiceInteraction"

/*
THESIS: AEOS is a voice-first study instrument, not a chat dashboard; the microphone orb owns the first view.
OWN-WORLD: Near-black fields, one violet energy source, quiet bordered surfaces, and literal compact controls.
STORY: Upload a PDF, speak a question, see the transcript, then read or hear a page-grounded answer.
FIRST VIEWPORT: Brand and utilities frame a central orb; document readiness and the conversation sit immediately below or beside it.
FORM: Operate-mode voice console, directly pinned by the user's supplied mobile reference; no generated staging seed.
*/
export default function DocumentChatPage(props) {
  const {
    resetKey, isManagedKey, documents, activeDocumentName, activeDocument, selectDocument,
    indexing, dragActive, setDragActive, fileInputRef, processFiles,
    mode, setMode, showSources, setShowSources, showSummary, setShowSummary,
    clearChat, messages, followUpQuestions, sendMessage, bottomRef,
    inputRef, inputValue, setInputValue, loading,
  } = props
  const menuRef = useRef(null)
  const lastSpokenMessageRef = useRef(null)
  const voice = useVoiceInteraction({
    onTranscript: setInputValue,
    onSubmit: sendMessage,
    disabled: loading || indexing || !activeDocument,
  })

  const latestAssistantMessage = [...messages].reverse().find(message => message.role === "assistant")

  useEffect(() => {
    if (!latestAssistantMessage) {
      lastSpokenMessageRef.current = null
      return
    }
    if (!loading && latestAssistantMessage !== lastSpokenMessageRef.current) {
      lastSpokenMessageRef.current = latestAssistantMessage
      voice.speak(latestAssistantMessage.content)
    }
  }, [latestAssistantMessage, loading, voice.speak])

  const orbState = !activeDocument
    ? "upload"
    : loading || indexing
      ? "thinking"
      : voice.isListening
        ? "listening"
        : voice.isSpeaking
          ? "speaking"
          : "idle"

  const status = indexing
    ? "READING DOCUMENT"
    : loading
      ? "FINDING ANSWER"
      : voice.isListening
        ? "LISTENING"
        : voice.isSpeaking
          ? "SPEAKING"
          : activeDocument
            ? "READY"
            : "PDF REQUIRED"

  function handleOrbClick() {
    if (!activeDocument) {
      fileInputRef.current?.click()
      return
    }
    if (voice.isSpeaking) {
      voice.stopSpeaking()
      return
    }
    voice.toggleListening()
  }

  function openSettings() {
    if (menuRef.current) menuRef.current.open = true
  }

  return <div className={`page ${activeDocument ? "document-active-page" : ""}`}><main className={`app ${activeDocument ? "document-active" : ""}`}>
    <input ref={fileInputRef} type="file" accept=".pdf" multiple hidden onChange={event => processFiles(event.target.files)} />
    <header className="header">
      <details className="utility-menu" ref={menuRef}>
        <summary className="round-control" aria-label="Open controls"><AppIcon name="menu" size={21} /></summary>
        <div className="utility-panel">
          <div className="utility-title">Answer controls</div>
          {activeDocument && <ChatControls
            mode={mode}
            onModeChange={setMode}
            showSources={showSources}
            onSourcesToggle={() => setShowSources(value => !value)}
            showSummary={showSummary}
            onSummaryToggle={() => setShowSummary(value => !value)}
            onClear={clearChat}
            messages={messages}
            documentName={activeDocumentName}
          />}
          {documents.length > 1 && <nav className="tabs utility-documents" aria-label="Uploaded documents">
            {documents.map(document => <button
              key={document.name}
              className={`tab ${document.name === activeDocumentName ? "active" : ""}`}
              onClick={() => selectDocument(document.name)}
            >
              {shorten(document.name, 22)}
            </button>)}
          </nav>}
          {!isManagedKey && <button className="tool-button key-control" onClick={resetKey}>Change API key</button>}
        </div>
      </details>
      <BrandMark className="brand" />
      <button type="button" className="round-control" onClick={() => fileInputRef.current?.click()} aria-label="Upload another PDF"><AppIcon name="document" size={21} /></button>
    </header>

    <div className={`voice-layout ${activeDocument ? "" : "empty"}`}>
      <section className="voice-stage" aria-labelledby="voice-heading">
        <VoiceOrb state={orbState} disabled={loading || indexing} onClick={handleOrbClick} />
        <div className="voice-copy">
          <h1 id="voice-heading">{activeDocument ? "Ask your document" : "Upload a document"}</h1>
          <p className={`voice-status ${orbState}`}><span />{status}</p>
        </div>

        {voice.voiceError && <div className="voice-error" role="alert">{voice.voiceError}</div>}

        {!activeDocument && <DocumentUploader
          indexing={indexing}
          dragActive={dragActive}
          fileInputRef={fileInputRef}
          onDragActiveChange={setDragActive}
          onFiles={processFiles}
          document={activeDocument}
        />}
      </section>

      {activeDocument && <section className="conversation-panel">
        {showSummary && activeDocument && <section className="summary">
          <div className="summary-title">{activeDocument.name} · {activeDocument.pages} pages</div>
          <div className="summary-content">{activeDocument.summary}</div>
        </section>}

        <ChatConversation
          document={activeDocument}
          messages={messages}
          loading={loading}
          showSources={showSources}
          bottomRef={bottomRef}
          onSpeak={voice.speak}
          onStopSpeaking={voice.stopSpeaking}
          isSpeaking={voice.isSpeaking}
        />

        {activeDocument && <MessageInput
          inputRef={inputRef}
          value={inputValue}
          onChange={setInputValue}
          onSend={sendMessage}
          loading={loading}
          listening={voice.isListening}
          onVoiceToggle={voice.toggleListening}
          suggestions={followUpQuestions}
          onSuggestion={sendMessage}
        />}
      </section>}
    </div>

    <nav className="bottom-nav" aria-label="Primary navigation">
      <button type="button" className="active"><AppIcon name="home" /><span>Home</span></button>
      <button type="button" onClick={() => fileInputRef.current?.click()}><AppIcon name="document" /><span>Documents</span></button>
      <button type="button" onClick={() => inputRef.current?.focus()} disabled={!activeDocument}><AppIcon name="chat" /><span>Chat</span></button>
      <button type="button" onClick={openSettings}><AppIcon name="settings" /><span>Settings</span></button>
    </nav>

  </main></div>
}

function shorten(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
