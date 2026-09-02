import AppIcon from "./AppIcon"

export default function MessageInput({ inputRef, value, onChange, onSend, loading, listening, transcribing, onVoiceToggle, suggestions = [], onSuggestion }) {
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      onSend(value)
    }
  }

  return <div className="composer">
    {suggestions.length > 0 && !loading && <div className="composer-suggestions" aria-label="Suggested follow-up questions">
      {suggestions.map((question, index) => <button key={index} type="button" className="suggestion-chip" onClick={() => onSuggestion(question)} title={question}>{question}</button>)}
    </div>}
    <div className="input-bar">
      <input ref={inputRef} className="text-input" value={value} onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ask anything in this PDF..." disabled={loading} aria-label="Question" />
      <button type="button" className={`input-action mic-button ${listening ? "active" : ""}`} onClick={onVoiceToggle} disabled={loading || transcribing} aria-label={transcribing ? "Transcribing voice" : listening ? "Listening; submits after you pause" : "Start listening"}><AppIcon name="mic" size={20} /></button>
      <button type="button" className="primary-button send-button" onClick={() => onSend(value)} disabled={loading || !value.trim()} aria-label="Send question"><AppIcon name="send" size={19} /></button>
    </div>
  </div>
}
