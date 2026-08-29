export function downloadChat(messages, documentName) {
  const lines = [`# DocMind - ${documentName}`, `Date: ${new Date().toLocaleString()}`, "---", ""]

  messages.forEach(message => {
    const author = message.role === "user" ? "You" : "DocMind"
    lines.push(`**${author}:** ${message.content}\n`)
  })

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = `docmind-${Date.now()}.md`
  link.click()
}
