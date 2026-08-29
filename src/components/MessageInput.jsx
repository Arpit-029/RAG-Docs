export default function MessageInput({ inputRef, value, onChange, onSend, loading }) {
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      onSend(value)
    }
  }

  return <div className="input-bar">
    <input ref={inputRef} className="text-input" value={value} onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ask anything..." disabled={loading} />
    <button className="primary-button send-button" onClick={() => onSend(value)} disabled={loading}>Send</button>
  </div>
}
