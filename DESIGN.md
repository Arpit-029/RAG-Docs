# AEOS Voice Design System

## Direction

AEOS is a quiet, voice-first study instrument. A single luminous violet orb owns the opening view and communicates listening, processing, and speaking states. The interface avoids assistant avatars, decorative dashboards, and unrelated suggestions so the learner stays focused on their document and question.

## Color

- Canvas: `#050506`
- Raised surface: `#101012`
- Raised hover: `#17141c`
- Primary text: `#f6f3fa`
- Secondary text: `#aaa4b2`
- Muted text: `#77717f`
- Violet: `#a855f7`
- Bright violet: `#c084fc`
- Violet wash: `rgba(168, 85, 247, 0.14)`
- Border: `rgba(255, 255, 255, 0.09)`
- Error: `#fb7185`

## Typography

Use the system UI stack for reliable loading and clear document reading. The AEOS wordmark alone uses compact, high-contrast serif lettering with a custom lightning-cut “O”; labels use restrained uppercase only for live system state. Answer text remains sentence case with a comfortable 1.6 line height.

## Composition

Before upload, the screen follows one vertical path from the orb to the uploader. After upload and before the first question, the clean dome and prompt sit centered in the available frame; on laptop layouts, the AEOS wordmark quietly centers the empty answer region. Once a question, answer, loading state, or follow-up appears, the dome lifts into a compact top stage so the conversation can expand below it. The document remains background context without a document card or a boxed conversation section.

## Components

- The orb is a real, centered button and the dominant voice control; it presents as a clean violet dome without an overlaid microphone symbol or outer ring line.
- Surfaces use 14–16px radii, one subtle border, and offset soft shadows.
- Small controls may be circular or pill-shaped; content containers are not pills.
- Page citations are compact violet text chips and remain visible even when full excerpts are collapsed.
- The composer stays reachable near the bottom of the active conversation.
- Follow-up prompts float in one compact horizontal row directly above the composer, without a section label; the composer itself uses one continuous rounded shell with integrated voice and send actions.

## Motion

The central orb is a bounded WebGL shader: its fluid violet surface responds to microphone energy while listening, accelerates while processing, and settles into a softer rhythm while speaking. Rendering pauses when the orb is offscreen or the page is hidden; motion stops under `prefers-reduced-motion`.

## Responsive Rules

- Mobile breakpoint: below 820px.
- Primary actions live in the header and composer rather than a persistent bottom navigation bar.
- Phone layouts respect notch and home-indicator safe areas and prevent keyboard input zoom.
- The active-document shell is locked to one viewport; only the message stream may overflow internally so the orb and composer remain reachable.
- The orb and vertical spacing compress on short screens without reducing primary touch targets.
- Touch targets are at least 44px.
- The answer column never exceeds a comfortable reading measure.

## Voice and Copy

Controls use literal labels: “Upload PDF”, “Start listening”, “Stop listening”, “Replay answer”, and “Ask anything in this PDF”. Status messages describe current work and recovery without personality filler.
