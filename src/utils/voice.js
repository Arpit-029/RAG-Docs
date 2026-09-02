export const VOICE_LANGUAGES = [
  { value: "", label: "Auto detect" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "bn", label: "Bengali" },
  { value: "gu", label: "Gujarati" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "pa", label: "Punjabi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "ur", label: "Urdu" },
]

const RECOGNITION_ERRORS = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings and try again.",
  "service-not-allowed": "Speech recognition is disabled by this browser or device. Try the reliable recording mode again.",
  "audio-capture": "The microphone is unavailable or already in use by another app.",
  network: "Speech recognition could not reach the transcription service. Check your connection and try again.",
  "language-not-supported": "This device does not support the selected voice language. Choose Auto detect or another language.",
  "no-speech": "No speech was detected. Tap the orb and try again.",
  aborted: "Voice input was cancelled.",
}

const MEDIA_ERRORS = {
  NotAllowedError: RECOGNITION_ERRORS["not-allowed"],
  SecurityError: RECOGNITION_ERRORS["not-allowed"],
  NotFoundError: "No microphone was found. Connect one or select another input device.",
  NotReadableError: RECOGNITION_ERRORS["audio-capture"],
  AbortError: "Microphone startup was interrupted. Tap the orb to try again.",
}

export function recognitionErrorMessage(code) {
  return RECOGNITION_ERRORS[code] || `Voice input stopped${code ? ` (${code})` : ""}. Try again or type the question.`
}

export function mediaErrorMessage(name) {
  return MEDIA_ERRORS[name] || "The microphone could not start. Check the active input device and try again."
}

export function preferredAudioMimeType(MediaRecorderClass) {
  if (!MediaRecorderClass?.isTypeSupported) return ""
  return [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ].find(type => MediaRecorderClass.isTypeSupported(type)) || ""
}

export function normalizeVoiceLanguage(language) {
  return VOICE_LANGUAGES.some(option => option.value === language) ? language : ""
}
