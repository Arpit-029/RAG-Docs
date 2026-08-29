export default function DocumentUploader({ indexing, dragActive, fileInputRef, onDragActiveChange, onFiles }) {
  function handleDrop(event) {
    event.preventDefault()
    onDragActiveChange(false)
    onFiles(event.dataTransfer.files)
  }

  return <div className={`drop-zone ${dragActive ? "active" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={event => { event.preventDefault(); onDragActiveChange(true) }} onDragLeave={() => onDragActiveChange(false)} onDrop={handleDrop}>
    <input ref={fileInputRef} type="file" accept=".pdf" multiple hidden onChange={event => onFiles(event.target.files)} />
    {indexing ? "Indexing PDF..." : <>Drop a PDF or <span className="accent">click to upload</span></>}
  </div>
}
