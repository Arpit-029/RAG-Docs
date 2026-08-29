export default function ApiKeyPage({ keyDraft, onKeyDraftChange, onSave }) {
  return <div className="page"><main className="key-page">
    <h1>DocMind</h1>
    <p>Enter your Groq API key to get started. <a className="accent" href="https://console.groq.com/keys" target="_blank">Get a free key</a></p>
    <input className="key-input" type="password" placeholder="gsk_..." value={keyDraft} onChange={event => onKeyDraftChange(event.target.value)} onKeyDown={event => event.key === "Enter" && onSave()} autoFocus />
    <button className="primary-button" onClick={onSave}>Continue</button>
    <span className="muted">Your key is stored only in this browser.</span>
  </main></div>
}
