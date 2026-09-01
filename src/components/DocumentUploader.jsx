import AppIcon from "./AppIcon"

export default function DocumentUploader({ indexing, dragActive, fileInputRef, onDragActiveChange, onFiles, document }) {
  function handleDrop(event) {
    event.preventDefault()
    onDragActiveChange(false)
    onFiles(event.dataTransfer.files)
  }

  return <div className={`drop-zone ${dragActive ? "active" : ""} ${document ? "has-document" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={event => { event.preventDefault(); onDragActiveChange(true) }} onDragLeave={() => onDragActiveChange(false)} onDrop={handleDrop} role="button" tabIndex="0" onKeyDown={event => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click() }}>
    <span className="document-icon"><AppIcon name="document" size={24} /></span>
    <span className="document-copy">
      <strong>{indexing ? "Reading your PDF..." : document?.name || "Upload a PDF"}</strong>
      <small>{indexing ? "Extracting pages and preparing answers" : document ? `${document.pages} pages ready` : "Drop a file here or click to browse"}</small>
    </span>
    <span className="document-action"><AppIcon name="chevron" size={20} /></span>
  </div>
}
