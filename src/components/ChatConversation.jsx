// Shows every chat state: empty state, messages, loading state, and follow-ups.
import AppIcon from "./AppIcon"

export default function ChatConversation({ messages, loading, showSources, bottomRef, onSpeak, onStopSpeaking, isSpeaking }) {
  return <section className="chat">
    {messages.map((message, index) => <Message key={index} message={message} showSources={showSources} onSpeak={onSpeak} onStopSpeaking={onStopSpeaking} isSpeaking={isSpeaking && index === messages.length - 1} />)}

    {loading && <div className="message-row assistant"><div className="message assistant"><span className="typing">Loading...</span></div></div>}

    <div ref={bottomRef} />
  </section>
}

function Message({ message, showSources, onSpeak, onStopSpeaking, isSpeaking }) {
  const pages = [...new Set(
    [...message.content.matchAll(/\[(?:S\d+,\s*)?p\.\s*(\d+)\]/gi)].map(match => Number(match[1])),
  )]
  return <div className={`message-row ${message.role}`}>
    <div className={`message ${message.role}`}>
      <div className="message-text">{message.content}</div>
      {message.role === "assistant" && <div className="answer-footer">
        {pages.length > 0 && <span className="page-reference"><AppIcon name="document" size={15} /> Pages {pages.join(", ")}</span>}
        <button type="button" className="playback-button" onClick={() => isSpeaking ? onStopSpeaking() : onSpeak(message.content)} aria-label={isSpeaking ? "Stop speaking" : "Read answer aloud"}><AppIcon name={isSpeaking ? "stop" : "volume"} size={17} /></button>
        <button type="button" className="playback-button" onClick={() => onSpeak(message.content)} aria-label="Replay answer"><AppIcon name="replay" size={17} /></button>
      </div>}
      {showSources && message.role === "assistant" && message.sources?.map((source, index) => <div key={index} className="source">Source {index + 1} · page {source.page}: {shorten(source.text, 240)}</div>)}
    </div>
  </div>
}

function shorten(text, maxLength = 48) {
  // Long source excerpts and questions stay readable inside their small UI elements.
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
