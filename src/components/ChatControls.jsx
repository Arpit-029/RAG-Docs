import { CHAT_MODES } from "../constants/chatModes"
import { downloadChat } from "../utils/chatExport"

export default function ChatControls({
  mode,
  onModeChange,
  showSources,
  onSourcesToggle,
  showSummary,
  onSummaryToggle,
  voiceLanguage,
  voiceLanguages,
  onVoiceLanguageChange,
  onClear,
  messages,
  documentName,
}) {
  return <div className="answer-controls">
    <div className="control-group">
      <label className="control-label" htmlFor="answer-style">Answer style</label>
      <select id="answer-style" className="mode-select" value={mode} onChange={event => onModeChange(event.target.value)}>
        {CHAT_MODES.map(chatMode => <option key={chatMode}>{chatMode}</option>)}
      </select>
    </div>

    <div className="control-group">
      <label className="control-label" htmlFor="voice-language">Voice language</label>
      <select id="voice-language" className="mode-select" value={voiceLanguage} onChange={event => onVoiceLanguageChange(event.target.value)}>
        {voiceLanguages.map(language => <option key={language.value || "auto"} value={language.value}>{language.label}</option>)}
      </select>
    </div>

    <fieldset className="control-group presentation-controls">
      <legend className="control-label">Include in answer</legend>
      <div className="control-options">
        <button className={`preference-button ${showSources ? "active" : ""}`} onClick={onSourcesToggle} aria-pressed={showSources}>
          <span><strong>Sources</strong><small>Page references</small></span>
          <em>{showSources ? "On" : "Off"}</em>
        </button>
        <button className={`preference-button ${showSummary ? "active" : ""}`} onClick={onSummaryToggle} aria-pressed={showSummary}>
          <span><strong>Summary</strong><small>Document overview</small></span>
          <em>{showSummary ? "On" : "Off"}</em>
        </button>
      </div>
    </fieldset>

    {messages.length > 0 && <div className="control-actions" aria-label="Chat actions">
      <button className="tool-button" onClick={() => downloadChat(messages, documentName)}>Export chat</button>
      <button className="tool-button danger" onClick={onClear}>Clear chat</button>
    </div>}
  </div>
}
