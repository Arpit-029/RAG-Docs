import { useCallback, useEffect, useRef, useState } from "react"

function speechRecognitionConstructor() {
  if (typeof window === "undefined") return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function textForSpeech(text) {
  return text
    .replace(/\[(?:S\d+,\s*)?p\.\s*\d+\]/gi, "")
    .replace(/[`*_#>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const ELEGANT_FEMALE_VOICE_NAMES = [
  "Microsoft Neerja Online",
  "Microsoft Neerja",
  "Microsoft Heera",
  "Microsoft Sonia Online",
  "Microsoft Sonia",
  "Microsoft Aria Online",
  "Microsoft Aria",
  "Microsoft Jenny Online",
  "Microsoft Jenny",
  "Google UK English Female",
  "Google US English",
  "Samantha",
  "Ava",
  "Serena",
  "Tessa",
  "Karen",
  "Moira",
  "Victoria",
  "Zira",
]

function selectElegantFemaleVoice(voices, language) {
  const preferredLanguage = language.toLowerCase()
  const languageFamily = preferredLanguage.split("-")[0]

  for (const preferredName of ELEGANT_FEMALE_VOICE_NAMES) {
    const matchingVoice = voices.find(voice =>
      voice.name.toLowerCase().includes(preferredName.toLowerCase())
      && voice.lang.toLowerCase().startsWith(languageFamily),
    )
    if (matchingVoice) return matchingVoice
  }

  return voices.find(voice => voice.lang.toLowerCase() === preferredLanguage && voice.localService)
    || voices.find(voice => voice.lang.toLowerCase().startsWith(languageFamily) && voice.localService)
    || voices.find(voice => voice.lang.toLowerCase().startsWith(languageFamily))
    || null
}

export function useVoiceInteraction({ onTranscript, onSubmit, disabled }) {
  const Recognition = speechRecognitionConstructor()
  const recognitionSupported = Boolean(Recognition)
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  const recognitionRef = useRef(null)
  const transcriptRef = useRef("")
  const cancelSubmissionRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  const onSubmitRef = useRef(onSubmit)
  const availableVoicesRef = useRef([])

  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])

  useEffect(() => {
    if (!speechSupported) return undefined
    const loadVoices = () => { availableVoicesRef.current = window.speechSynthesis.getVoices() }
    loadVoices()
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices)
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices)
  }, [speechSupported])

  const stopSpeaking = useCallback(() => {
    if (!speechSupported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [speechSupported])

  const speak = useCallback((text) => {
    if (!speechSupported || !text?.trim()) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(textForSpeech(text))
    const voices = availableVoicesRef.current.length
      ? availableVoicesRef.current
      : window.speechSynthesis.getVoices()
    const language = navigator.language || "en-US"
    utterance.voice = selectElegantFemaleVoice(voices, language)
    utterance.lang = utterance.voice?.lang || language
    utterance.rate = 0.92
    utterance.pitch = 1.08
    utterance.volume = 0.96
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [speechSupported])

  useEffect(() => {
    if (!Recognition) return undefined

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = navigator.language || "en-US"

    recognition.onstart = () => {
      transcriptRef.current = ""
      cancelSubmissionRef.current = false
      setVoiceError("")
      setIsListening(true)
    }

    recognition.onresult = event => {
      let transcript = ""
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript
      }
      transcriptRef.current = transcript.trim()
      onTranscriptRef.current(transcriptRef.current)
    }

    recognition.onerror = event => {
      cancelSubmissionRef.current = true
      setIsListening(false)
      if (event.error === "not-allowed") {
        setVoiceError("Microphone access is blocked. Allow it in your browser or type the question.")
      } else if (event.error === "no-speech") {
        setVoiceError("No speech was detected. Tap the orb and try again.")
      } else {
        setVoiceError("Voice input stopped. Try again or type the question.")
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      const transcript = transcriptRef.current.trim()
      if (transcript && !cancelSubmissionRef.current) onSubmitRef.current(transcript)
    }

    recognitionRef.current = recognition
    return () => {
      cancelSubmissionRef.current = true
      recognition.abort()
      recognitionRef.current = null
    }
  }, [Recognition])

  const startListening = useCallback(() => {
    if (disabled) return
    if (!recognitionSupported) {
      setVoiceError("Voice input is not supported in this browser. Use Chrome or Edge, or type the question.")
      return
    }
    stopSpeaking()
    setVoiceError("")
    try {
      recognitionRef.current?.start()
    } catch {
      setVoiceError("The microphone is already starting. Please try again.")
    }
  }, [disabled, recognitionSupported, stopSpeaking])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  return {
    recognitionSupported,
    speechSupported,
    isListening,
    isSpeaking,
    voiceError,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
  }
}
