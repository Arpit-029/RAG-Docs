import ChatControls from "../components/ChatControls"
import ChatConversation from "../components/ChatConversation"
import DocumentUploader from "../components/DocumentUploader"
import MessageInput from "../components/MessageInput"

// This page arranges the upload, document controls, conversation, and input.
export default function DocumentChatPage(props) {
  const {
    resetKey, isManagedKey, documents, activeDocumentName, activeDocument, selectDocument,
    indexing, dragActive, setDragActive, fileInputRef, processFiles,
    mode, setMode, showSources, setShowSources, showSummary, setShowSummary,
    clearChat, messages, followUpQuestions, sendMessage, bottomRef,
    inputRef, inputValue, setInputValue, loading,
  } = props

  return <div className="page"><main className="app">
    <header className="header">
      <div><span className="brand">DocMind</span><span className="tagline">Chat with PDFs</span></div>
      {!isManagedKey && <button className="tool-button" onClick={resetKey}>Change key</button>}
    </header>

    <DocumentUploader indexing={indexing} dragActive={dragActive} fileInputRef={fileInputRef} onDragActiveChange={setDragActive} onFiles={processFiles} />

    {documents.length > 0 && <nav className="tabs">
      {documents.map(document => <button
        key={document.name}
        className={`tab ${document.name === activeDocumentName ? "active" : ""}`}
        onClick={() => selectDocument(document.name)}
      >
        {shorten(document.name, 20)}
      </button>)}
    </nav>}

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

    {showSummary && activeDocument && <section className="summary">
      <div className="summary-title">
        {activeDocument.name} - {activeDocument.pages} pages - {activeDocument.chunks.length} chunks
      </div>
      <div className="summary-content">{activeDocument.summary}</div>
    </section>}
    {activeDocument && <div className="divider" />}

    <ChatConversation
      document={activeDocument}
      messages={messages}
      loading={loading}
      showSources={showSources}
      followUpQuestions={followUpQuestions}
      onFollowUp={sendMessage}
      bottomRef={bottomRef}
    />
    {activeDocument && <MessageInput
      inputRef={inputRef}
      value={inputValue}
      onChange={setInputValue}
      onSend={sendMessage}
      loading={loading}
    />}
  </main></div>
}

function shorten(text, maxLength) {
  // Keep document tabs compact without changing the original document name.
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
