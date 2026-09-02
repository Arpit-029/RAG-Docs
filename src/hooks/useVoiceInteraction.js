import { useCallback, useEffect, useRef, useState } from "react"
import { transcribeAudio } from "../services/transcription"
import {
  mediaErrorMessage,
  normalizeVoiceLanguage,
  preferredAudioMimeType,
  recognitionErrorMessage,
  VOICE_LANGUAGES,
} from "../utils/voice"

const MAX_RECORDING_MS = 60_000
const VOICE_LANGUAGE_KEY = "aeos_voice_language"

function speechRecognitionConstructor() {
  if (typeof window === "undefined") return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function mediaRecorderConstructor() {
  if (typeof window === "undefined") return null
  return window.MediaRecorder || null
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

export function useVoiceInteraction({ onTranscript, onSubmit, disabled, apiKey }) {
  const Recognition = speechRecognitionConstructor()
  const Recorder = mediaRecorderConstructor()
  const recognitionSupported = Boolean(Recognition)
  const recordingSupported = Boolean(Recorder && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia)
  const voiceSupported = recordingSupported || recognitionSupported
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  const [mediaStream, setMediaStream] = useState(null)
  const [language, setLanguageState] = useState(() => {
    if (typeof localStorage === "undefined") return ""
    return normalizeVoiceLanguage(localStorage.getItem(VOICE_LANGUAGE_KEY) || "")
  })
  const recognitionRef = useRef(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const transcriptionControllerRef = useRef(null)
  const transcriptRef = useRef("")
  const cancelSubmissionRef = useRef(false)
  const discardRecordingRef = useRef(false)
  const startingRef = useRef(false)
  const mountedRef = useRef(true)
  const disabledRef = useRef(disabled)
  const onTranscriptRef = useRef(onTranscript)
  const onSubmitRef = useRef(onSubmit)
  const availableVoicesRef = useRef([])

  useEffect(() => { disabledRef.current = disabled }, [disabled])
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])

  const setLanguage = useCallback(value => {
    const normalized = normalizeVoiceLanguage(value)
    setLanguageState(normalized)
    if (typeof localStorage !== "undefined") localStorage.setItem(VOICE_LANGUAGE_KEY, normalized)
  }, [])

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
    const speechLanguage = language || navigator.language || "en-US"
    utterance.voice = selectElegantFemaleVoice(voices, speechLanguage)
    utterance.lang = utterance.voice?.lang || speechLanguage
    utterance.rate = 0.92
    utterance.pitch = 1.08
    utterance.volume = 0.96
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [language, speechSupported])

  const releaseRecordingStream = useCallback(() => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current)
    recordingTimerRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (mountedRef.current) setMediaStream(null)
  }, [])

  const finishRecording = useCallback(async recorder => {
    if (recorderRef.current === recorder) recorderRef.current = null
    const chunks = audioChunksRef.current
    audioChunksRef.current = []
    releaseRecordingStream()
    if (!mountedRef.current) return
    setIsListening(false)

    if (discardRecordingRef.current) {
      discardRecordingRef.current = false
      return
    }

    const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/webm" })
    if (!audio.size) {
      setVoiceError("No speech was recorded. Tap the orb and try again.")
      return
    }

    transcriptionControllerRef.current?.abort()
    const controller = new AbortController()
    transcriptionControllerRef.current = controller
    setIsTranscribing(true)
    setVoiceError("")
    try {
      const transcript = await transcribeAudio(apiKey, audio, language, controller.signal)
      if (!transcript) {
        setVoiceError("No speech was detected. Tap the orb and try again.")
        return
      }
      onTranscriptRef.current(transcript)
      onSubmitRef.current(transcript)
    } catch (error) {
      if (error.name !== "AbortError") setVoiceError(error.message || "Voice transcription failed. Try again.")
    } finally {
      if (transcriptionControllerRef.current === controller) transcriptionControllerRef.current = null
      if (mountedRef.current) setIsTranscribing(false)
    }
  }, [apiKey, language, releaseRecordingStream])

  const startRecording = useCallback(async () => {
    if (startingRef.current || !Recorder) return
    startingRef.current = true
    discardRecordingRef.current = false
    setVoiceError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      if (disabledRef.current || !mountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      const mimeType = preferredAudioMimeType(Recorder)
      const recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream)
      streamRef.current = stream
      recorderRef.current = recorder
      audioChunksRef.current = []
      setMediaStream(stream)

      recorder.ondataavailable = event => {
        if (event.data?.size) audioChunksRef.current.push(event.data)
      }
      recorder.onerror = event => {
        discardRecordingRef.current = true
        setVoiceError(mediaErrorMessage(event.error?.name))
      }
      recorder.onstop = () => { void finishRecording(recorder) }
      recorder.start(250)
      setIsListening(true)
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop()
      }, MAX_RECORDING_MS)
    } catch (error) {
      releaseRecordingStream()
      setIsListening(false)
      setVoiceError(mediaErrorMessage(error.name))
    } finally {
      startingRef.current = false
    }
  }, [Recorder, finishRecording, releaseRecordingStream])

  useEffect(() => {
    if (!Recognition) return undefined

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true

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
      setVoiceError(recognitionErrorMessage(event.error))
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
    if (disabled || isTranscribing) return
    stopSpeaking()
    setVoiceError("")
    if (recordingSupported) {
      void startRecording()
      return
    }
    if (!recognitionSupported) {
      setVoiceError("Voice input is not supported by this browser. Type the question or try an updated browser.")
      return
    }
    try {
      recognitionRef.current.lang = language || navigator.language || "en-US"
      recognitionRef.current.start()
    } catch {
      setVoiceError("The microphone is already starting. Please try again.")
    }
  }, [disabled, isTranscribing, language, recognitionSupported, recordingSupported, startRecording, stopSpeaking])

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") recorder.stop()
    else recognitionRef.current?.stop()
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  useEffect(() => () => {
    mountedRef.current = false
    transcriptionControllerRef.current?.abort()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null
      recorder.stop()
    }
    releaseRecordingStream()
  }, [releaseRecordingStream])

  return {
    recognitionSupported,
    recordingSupported,
    voiceSupported,
    speechSupported,
    isListening,
    isTranscribing,
    isSpeaking,
    voiceError,
    mediaStream,
    language,
    languages: VOICE_LANGUAGES,
    setLanguage,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
  }
}
