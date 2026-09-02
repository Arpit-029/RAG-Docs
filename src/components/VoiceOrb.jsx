import { useEffect, useRef } from "react"
import { Mesh, Program, Renderer, Triangle, Vec3 } from "ogl"

const vertexShader = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float iTime;
  uniform vec3 iResolution;
  uniform float activity;
  uniform float rotation;
  varying vec2 vUv;

  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise(p);
      p = rotate2d(0.58) * p * 2.02 + 7.1;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 resolution = iResolution.xy;
    vec2 uv = (vUv * resolution - 0.5 * resolution) / min(resolution.x, resolution.y);
    uv *= 2.15;
    uv = rotate2d(rotation) * uv;

    float time = iTime * (0.16 + activity * 0.34);
    float firstFlow = fbm(uv * 1.55 + vec2(time, -time * 0.7));
    float secondFlow = fbm(uv * 2.8 + vec2(-time * 0.45, time) + firstFlow);
    float distortion = (firstFlow - 0.5) * (0.14 + activity * 0.16);
    vec2 warpedUv = uv + distortion * vec2(
      sin(uv.y * 3.1 + time * 4.0),
      cos(uv.x * 3.4 - time * 3.2)
    );

    float radius = length(warpedUv);
    float organicEdge = 0.79 + (secondFlow - 0.5) * (0.13 + activity * 0.15);
    float body = 1.0 - smoothstep(organicEdge - 0.11, organicEdge + 0.025, radius);
    float innerGlow = pow(max(0.0, 1.0 - radius / max(organicEdge, 0.01)), 1.55);
    float movingLight = pow(max(0.0, 1.0 - distance(warpedUv, vec2(
      cos(time * 3.2) * 0.27,
      sin(time * 2.6) * 0.24
    ))), 4.5);

    vec3 midnight = vec3(0.035, 0.018, 0.09);
    vec3 violet = vec3(0.39, 0.10, 0.72);
    vec3 electric = vec3(0.69, 0.28, 1.0);
    vec3 pearl = vec3(0.88, 0.72, 1.0);
    vec3 color = mix(midnight, violet, clamp(firstFlow + innerGlow * 0.52, 0.0, 1.0));
    color = mix(color, electric, clamp(secondFlow * 0.72 + activity * 0.34, 0.0, 1.0));
    color += pearl * movingLight * (0.18 + activity * 0.48);
    color += electric * innerGlow * (0.20 + activity * 0.25);

    float rim = smoothstep(0.55, organicEdge, radius) * body;
    color += electric * rim * (0.22 + activity * 0.4);
    float alpha = body * (0.88 + innerGlow * 0.12);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`

export default function VoiceOrb({ state, disabled, onClick, mediaStream }) {
  const containerRef = useRef(null)
  const stateRef = useRef(state)
  const analyserRef = useRef(null)
  const frequencyDataRef = useRef(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (state !== "listening" || !mediaStream) {
      analyserRef.current = null
      frequencyDataRef.current = null
      return undefined
    }

    let cancelled = false
    let audioContext
    let source

    async function connectVoiceMeter() {
      try {
        if (cancelled) return
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (!AudioContext) return
        audioContext = new AudioContext()
        if (audioContext.state === "suspended") await audioContext.resume()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.45
        source = audioContext.createMediaStreamSource(mediaStream)
        source.connect(analyser)
        analyserRef.current = analyser
        frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount)
      } catch {
        // Speech recognition still works when the visual meter is unavailable.
      }
    }

    connectVoiceMeter()
    return () => {
      cancelled = true
      analyserRef.current = null
      frequencyDataRef.current = null
      source?.disconnect()
      if (audioContext && audioContext.state !== "closed") audioContext.close()
    }
  }, [mediaStream, state])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const renderer = new Renderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    container.appendChild(gl.canvas)

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      transparent: true,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Vec3(1, 1, 1) },
        activity: { value: 0.08 },
        rotation: { value: 0 },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
    let frameId
    let previousTime = performance.now()
    let rotation = 0
    let activity = 0.08
    let isOnScreen = true
    let lastReducedState = null

    function resize() {
      const width = container.clientWidth
      const height = container.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height)
      program.uniforms.iResolution.value.set(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height)
    }

    function voiceLevel() {
      const analyser = analyserRef.current
      const data = frequencyDataRef.current
      if (!analyser || !data) return 0
      analyser.getByteFrequencyData(data)
      let energy = 0
      const limit = Math.min(data.length, 72)
      for (let index = 3; index < limit; index += 1) {
        const value = data[index] / 255
        energy += value * value
      }
      return Math.min(Math.sqrt(energy / Math.max(limit - 3, 1)) * 3.2, 1)
    }

    function draw(now) {
      frameId = requestAnimationFrame(draw)
      if (document.hidden || !isOnScreen) return

      const delta = Math.min((now - previousTime) / 1000, 0.05)
      previousTime = now
      const currentState = stateRef.current
      const reducedMotion = reducedMotionQuery.matches
      if (reducedMotion && lastReducedState === currentState) return
      lastReducedState = reducedMotion ? currentState : null
      let targetActivity = 0.08
      if (currentState === "listening") targetActivity = Math.max(0.18, voiceLevel())
      else if (currentState === "thinking") targetActivity = 0.58
      else if (currentState === "speaking") targetActivity = 0.34 + Math.sin(now * 0.006) * 0.12
      else if (currentState === "upload") targetActivity = 0.04

      activity += (targetActivity - activity) * Math.min(delta * 7.5, 1)
      if (!reducedMotion) rotation += delta * (0.08 + activity * 1.2)
      program.uniforms.iTime.value = reducedMotion ? 0 : now / 1000
      program.uniforms.activity.value = reducedMotion ? targetActivity : activity
      program.uniforms.rotation.value = rotation
      renderer.render({ scene: mesh })
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    const intersectionObserver = new IntersectionObserver(entries => {
      isOnScreen = entries[0]?.isIntersecting ?? true
      if (isOnScreen) previousTime = performance.now()
    })
    intersectionObserver.observe(container)
    resize()
    frameId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [])

  const labels = {
    idle: "Start listening",
    listening: "Stop listening and ask",
    thinking: "Finding an answer",
    speaking: "Stop speaking",
    upload: "Upload a PDF",
  }

  return <button
    type="button"
    className={`voice-orb ${state}`}
    onClick={onClick}
    disabled={disabled}
    aria-label={labels[state] || labels.idle}
  >
    <span className="orb-halo" />
    <span className="orb-fallback" />
    <span ref={containerRef} className="orb-canvas" aria-hidden="true" />
  </button>
}
