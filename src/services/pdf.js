import * as pdfjsLib from "pdfjs-dist"
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min?url"

// PDF.js needs a separate worker file to read PDF content in the browser.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export async function parsePdf(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  let text = ""

  // Read every page and combine its visible text into one searchable string.
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    text += `${content.items.map(item => item.str).join(" ")}\n`
  }

  return { text, pages: pdf.numPages }
}
