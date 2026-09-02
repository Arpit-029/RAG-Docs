export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_PDF_PAGES = 250

export function isPdfFile(file) {
  return file?.type === "application/pdf" || file?.name?.toLowerCase().endsWith(".pdf")
}

export function validatePdfFile(file) {
  if (!isPdfFile(file)) throw new Error("Choose a PDF file.")
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("This PDF is empty.")
  if (file.size > MAX_PDF_BYTES) throw new Error("PDFs must be 20 MB or smaller.")
}
