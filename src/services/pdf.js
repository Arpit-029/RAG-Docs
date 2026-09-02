import * as pdfjsLib from "pdfjs-dist"
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min?url"
import { MAX_PDF_PAGES } from "../utils/pdfLimits"

// PDF.js needs a separate worker file to read PDF content in the browser.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export async function parsePdf(file) {
  const buffer = await file.arrayBuffer()
  let pdf

  try {
    pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDFs may contain at most ${MAX_PDF_PAGES} pages.`)

    let text = ""
    const pageTexts = []

    // Read every page and combine its visible text into one searchable string.
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items.map(item => item.str).join(" ")
      pageTexts.push(pageText)
      text += `${pageText}\n`
      page.cleanup()
    }

    return { text, pageTexts, pages: pdf.numPages }
  } finally {
    await pdf?.destroy()
  }
}
