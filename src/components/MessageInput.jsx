import AppIcon from "./AppIcon"
import { CHAT_MODES } from "../constants/chatModes"

export default function MessageInput({ inputRef, value, onChange, onSend, loading, listening, transcribing, onVoiceToggle, mode, onModeChange }) {
  function submitQuestion() {
    if (!value.trim()) return
    inputRef.current?.blur()
    onSend(value)
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submitQuestion()
    }
  }

  return <div className="composer">
    <fieldset className="composer-modes">
      <legend className="visually-hidden">Answer style</legend>
      {CHAT_MODES.map(chatMode => <button
        key={chatMode}
        type="button"
        className={`mode-chip ${mode === chatMode ? "active" : ""}`}
        onClick={() => onModeChange(chatMode)}
        aria-pressed={mode === chatMode}
      >{chatMode}</button>)}
    </fieldset>
    <div className="input-bar">
      <input ref={inputRef} className="text-input" value={value} onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ask anything in this PDF..." disabled={loading} aria-label="Question" />
      <button type="button" className={`input-action mic-button ${listening ? "active" : ""}`} onClick={onVoiceToggle} disabled={loading || transcribing} aria-label={transcribing ? "Transcribing voice" : listening ? "Listening; submits after you pause" : "Start listening"}><AppIcon name="mic" size={20} /></button>
      <button type="button" className="primary-button send-button" onClick={submitQuestion} disabled={loading || !value.trim()} aria-label="Send question"><AppIcon name="send" size={19} /></button>
    </div>
  </div>
}
