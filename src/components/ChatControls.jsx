import { CHAT_MODES } from "../constants/chatModes"
import { downloadChat } from "../utils/chatExport"

export default function ChatControls({ mode, onModeChange, showSources, onSourcesToggle, showSummary, onSummaryToggle, onClear, messages, documentName }) {
  return <div className="controls">
    <select className="mode-select" value={mode} onChange={event => onModeChange(event.target.value)}>{CHAT_MODES.map(chatMode => <option key={chatMode}>{chatMode}</option>)}</select>
    <button className={`tool-button ${showSources ? "active" : ""}`} onClick={onSourcesToggle}>Sources</button>
    <button className={`tool-button ${showSummary ? "active" : ""}`} onClick={onSummaryToggle}>Summary</button>
    <button className="tool-button" onClick={onClear}>Clear</button>
    {messages.length > 0 && <button className="tool-button" onClick={() => downloadChat(messages, documentName)}>Export</button>}
  </div>
}
