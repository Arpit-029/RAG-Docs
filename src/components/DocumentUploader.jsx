import AppIcon from "./AppIcon"

const processingStages = [
  { id: "reading", label: "Reading pages" },
  { id: "extracting", label: "Extracting text" },
  { id: "preparing", label: "Preparing answers" },
]

export default function DocumentUploader({ indexing, restoringDocument, processingDocument, dragActive, fileInputRef, onDragActiveChange, onFiles, document }) {
  function handleDrop(event) {
    event.preventDefault()
    onDragActiveChange(false)
    onFiles(event.dataTransfer.files)
  }

  if (indexing || restoringDocument) {
    const activeStage = processingStages.findIndex(stage => stage.id === processingDocument?.stage)

    return <section className="document-processing" aria-live="polite" aria-busy="true">
      <div className="processing-visual" aria-hidden="true">
        <span className="processing-glow" />
        <span className="processing-sheet processing-sheet-back" />
        <span className="processing-sheet processing-sheet-front">
          <i /><i /><i />
          <span className="processing-scan" />
        </span>
      </div>
      <div className="processing-copy">
        <strong>{restoringDocument ? "Restoring your document" : "Processing your document"}</strong>
        <small title={processingDocument?.name}>{restoringDocument ? "Opening your saved PDF" : processingDocument?.name || "Your PDF"}</small>
      </div>
      {!restoringDocument && <ol className="processing-stages" aria-label="Document processing progress">
        {processingStages.map((stage, index) => <li
          key={stage.id}
          className={index < activeStage ? "complete" : index === activeStage ? "active" : ""}
          aria-current={index === activeStage ? "step" : undefined}
        >
          <span>{index < activeStage ? "✓" : index + 1}</span>
          {stage.label}
        </li>)}
      </ol>}
    </section>
  }

  return <div className={`drop-zone ${dragActive ? "active" : ""} ${document ? "has-document" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={event => { event.preventDefault(); onDragActiveChange(true) }} onDragLeave={() => onDragActiveChange(false)} onDrop={handleDrop} role="button" tabIndex="0" onKeyDown={event => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click() }}>
    <span className="document-icon"><AppIcon name="document" size={24} /></span>
    <span className="document-copy">
      <strong>{document?.name || "Upload a PDF"}</strong>
      <small>{document ? `${document.pages} pages ready` : "Drop a file here or click to browse"}</small>
    </span>
    <span className="document-action"><AppIcon name="chevron" size={20} /></span>
  </div>
}
