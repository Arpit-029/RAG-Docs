# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students and independent learners who want to ask questions from uploaded study PDFs without navigating long documents manually.

## Product Purpose

AEOS lets a learner upload a PDF or question sheet, ask a question by voice or text, and receive a concise document-grounded answer in both written and spoken form.

## Positioning

The product combines a voice-first question flow with page-aware document evidence, so spoken answers remain inspectable as text and traceable to the uploaded material.

## Operating Context

The primary workflow is: upload a PDF, wait for document processing, press the central microphone, ask a question while the live transcript appears, then let the question submit automatically when speech ends. The learner can read or listen to the answer. Typing remains available when voice input is unavailable or inconvenient.

## Capabilities and Constraints

- PDF text extraction and page-aware source retrieval already run in the browser.
- Groq generates grounded answers through an existing server proxy or a user-supplied key.
- The first voice release uses browser speech recognition and speech synthesis; support and voice quality depend on the browser and operating system.
- The first release does not include continuous calling, accounts, progress tracking, semantic embeddings, or OCR for image-only PDFs.

## Brand Commitments

The product name is AEOS. The user selected a near-black, restrained violet, voice-assistant interface with a luminous central orb as the primary interaction.

## Evidence on Hand

- Existing PDF parsing, retrieval, grounded prompts, and Groq failover implementation in `src/` and `api/`.
- User-supplied mobile UI reference: `C:/Users/Dell/AppData/Local/Temp/codex-clipboard-1c3ec39f-f2ba-4e8b-aa1b-75fb004e9b03.png`.
- No testimonials, performance benchmarks, or public customer claims are available and none should be fabricated.

## Product Principles

- Voice is the fastest path, while text remains equally usable.
- Every document claim remains traceable to a page.
- Answers are short by default and expand only when asked.
- The interface exposes one clear action at a time.
- Failure states explain how the learner can recover.

## Accessibility & Inclusion

All voice actions require visible text equivalents. Core controls must be keyboard accessible, provide clear focus states, and respect reduced-motion preferences.
