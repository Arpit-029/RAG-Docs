import test from "node:test"
import assert from "node:assert/strict"
import { isPdfFile, MAX_PDF_BYTES, validatePdfFile } from "../src/utils/pdfLimits.js"

test("mobile file providers may identify PDFs by extension", () => {
  assert.equal(isPdfFile({ name: "notes.PDF", type: "" }), true)
})

test("oversized and empty PDFs are rejected", () => {
  assert.throws(() => validatePdfFile({ name: "empty.pdf", type: "application/pdf", size: 0 }), /empty/i)
  assert.throws(() => validatePdfFile({ name: "large.pdf", type: "application/pdf", size: MAX_PDF_BYTES + 1 }), /20 MB/i)
})
