// Shows every chat state: empty state, messages, loading state, and follow-ups.
export default function ChatConversation({ document, messages, loading, showSources, followUpQuestions, onFollowUp, bottomRef }) {
  return <section className="chat">
    {!document && <EmptyState>Upload a PDF above to start chatting.</EmptyState>}
    {document && messages.length === 0 && <EmptyState>Ask anything about <strong className="accent">{document.name}</strong></EmptyState>}

    {messages.map((message, index) => <Message key={index} message={message} showSources={showSources} />)}

    {loading && <div className="message-row assistant"><div className="message assistant"><span className="typing">Loading...</span></div></div>}

    {followUpQuestions.length > 0 && !loading && <div className="follow-ups">
      <div className="follow-ups-label">Follow-up questions</div>
      <div className="follow-up-list">
        {followUpQuestions.map((question, index) => <button key={index} className="chip" onClick={() => onFollowUp(question)}>{shorten(question)}</button>)}
      </div>
    </div>}

    <div ref={bottomRef} />
  </section>
}

function EmptyState({ children }) {
  return <div className="empty-state"><strong className="accent">DocMind</strong><div>{children}</div></div>
}

function Message({ message, showSources }) {
  return <div className={`message-row ${message.role}`}>
    <div className={`message ${message.role}`}>
      <div className="message-text">{message.content}</div>
      {showSources && message.role === "assistant" && message.sources?.map((source, index) => <div key={index} className="source">Source {index + 1} · page {source.page}: {shorten(source.text, 240)}</div>)}
    </div>
  </div>
}

function shorten(text, maxLength = 48) {
  // Long source excerpts and questions stay readable inside their small UI elements.
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
