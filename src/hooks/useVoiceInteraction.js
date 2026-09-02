import { useCallback, useEffect, useRef, useState } from "react"
import { transcribeAudio } from "../services/transcription"
import { synthesizeSpeech } from "../services/speech"
import {
  mediaErrorMessage,
  normalizeVoiceLanguage,
  prepareTextForSpeech,
  preferredAudioMimeType,
  recognitionErrorMessage,
  SMOOTH_SPEECH_SETTINGS,
  updateSpeechEndDetector,
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
  const nativeSpeechSupported = typeof window !== "undefined" && "speechSynthesis" in window
  const cloudSpeechSupported = typeof window !== "undefined" && "Audio" in window
  const speechSupported = cloudSpeechSupported || nativeSpeechSupported
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
  const voiceDetectionCleanupRef = useRef(null)
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
  const speechRequestRef = useRef(null)
  const playbackAudioRef = useRef(null)
  const playbackUrlRef = useRef("")

  useEffect(() => { disabledRef.current = disabled }, [disabled])
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])

  const setLanguage = useCallback(value => {
    const normalized = normalizeVoiceLanguage(value)
    setLanguageState(normalized)
    if (typeof localStorage !== "undefined") localStorage.setItem(VOICE_LANGUAGE_KEY, normalized)
  }, [])

  useEffect(() => {
    if (!nativeSpeechSupported) return undefined
    const loadVoices = () => { availableVoicesRef.current = window.speechSynthesis.getVoices() }
    loadVoices()
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices)
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices)
  }, [nativeSpeechSupported])

  const stopSpeaking = useCallback(() => {
    speechRequestRef.current?.abort()
    speechRequestRef.current = null
    const audio = playbackAudioRef.current
    playbackAudioRef.current = null
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute("src")
    }
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
    playbackUrlRef.current = ""
    if (nativeSpeechSupported) window.speechSynthesis.cancel()
    if (mountedRef.current) setIsSpeaking(false)
  }, [nativeSpeechSupported])

  const speak = useCallback(async (text) => {
    if (!speechSupported || !text?.trim()) return
    stopSpeaking()
    const spokenText = prepareTextForSpeech(text)
    const speechLanguage = language || navigator.language || "en-US"

    if (cloudSpeechSupported && speechLanguage.toLowerCase().startsWith("en")) {
      const controller = new AbortController()
      speechRequestRef.current = controller
      setIsSpeaking(true)
      try {
        const blob = await synthesizeSpeech(spokenText, controller.signal)
        if (controller.signal.aborted) return
        speechRequestRef.current = null
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.playbackRate = SMOOTH_SPEECH_SETTINGS.rate
        audio.preservesPitch = true
        playbackUrlRef.current = url
        playbackAudioRef.current = audio
        const finish = () => {
          if (playbackAudioRef.current !== audio) return
          playbackAudioRef.current = null
          playbackUrlRef.current = ""
          URL.revokeObjectURL(url)
          if (mountedRef.current) setIsSpeaking(false)
        }
        audio.onended = finish
        audio.onerror = finish
        await audio.play()
        return
      } catch (error) {
        if (error.name === "AbortError") return
        speechRequestRef.current = null
        if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current)
        playbackUrlRef.current = ""
        playbackAudioRef.current = null
      }
    }

    if (!nativeSpeechSupported) {
      if (mountedRef.current) setIsSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(spokenText)
    const voices = availableVoicesRef.current.length
      ? availableVoicesRef.current
      : window.speechSynthesis.getVoices()
    utterance.voice = selectElegantFemaleVoice(voices, speechLanguage)
    utterance.lang = utterance.voice?.lang || speechLanguage
    utterance.rate = SMOOTH_SPEECH_SETTINGS.rate
    utterance.pitch = SMOOTH_SPEECH_SETTINGS.pitch
    utterance.volume = SMOOTH_SPEECH_SETTINGS.volume
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [cloudSpeechSupported, language, nativeSpeechSupported, speechSupported, stopSpeaking])

  const releaseRecordingStream = useCallback(() => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current)
    recordingTimerRef.current = null
    voiceDetectionCleanupRef.current?.()
    voiceDetectionCleanupRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (mountedRef.current) setMediaStream(null)
  }, [])

  const detectEndOfSpeech = useCallback((stream, recorder) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      const samples = new Uint8Array(analyser.fftSize)
      let detector = { speechDetected: false, lastSpeechAt: 0, shouldStop: false }
      let frameId

      analyser.fftSize = 2_048
      analyser.smoothingTimeConstant = 0.2
      source.connect(analyser)
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => {})

      const measure = now => {
        analyser.getByteTimeDomainData(samples)
        let energy = 0
        for (const sample of samples) {
          const amplitude = (sample - 128) / 128
          energy += amplitude * amplitude
        }
        const level = Math.sqrt(energy / samples.length)
        detector = updateSpeechEndDetector(detector, level, now)

        if (detector.shouldStop) {
          if (recorder.state === "recording") recorder.stop()
          return
        }
        frameId = window.requestAnimationFrame(measure)
      }

      frameId = window.requestAnimationFrame(measure)
      voiceDetectionCleanupRef.current = () => {
        window.cancelAnimationFrame(frameId)
        source.disconnect()
        if (audioContext.state !== "closed") void audioContext.close()
      }
    } catch {
      // Manual stop and the recording time limit remain available when audio analysis fails.
    }
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
      detectEndOfSpeech(stream, recorder)
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
  }, [Recorder, detectEndOfSpeech, finishRecording, releaseRecordingStream])

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
    stopSpeaking()
    transcriptionControllerRef.current?.abort()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null
      recorder.stop()
    }
    releaseRecordingStream()
  }, [releaseRecordingStream, stopSpeaking])

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
