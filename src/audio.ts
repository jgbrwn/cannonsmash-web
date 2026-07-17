// Tiny WebAudio synth for game sounds. Lazy-init on first gesture.
let ctx: AudioContext | null = null
export let soundOn = true

export function setSound(on: boolean): void { soundOn = on }

export function initAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (AC) ctx = new AC()
  }
  if (ctx && ctx.state === 'suspended') ctx.resume()
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, freqEnd?: number): void {
  if (!soundOn || !ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur)
}

export function sfxPaddle(): void { tone(950, 0.05, 'square', 0.05, 500) }
export function sfxBounce(): void { tone(420, 0.06, 'sine', 0.08, 260) }
export function sfxNet(): void { tone(200, 0.12, 'sawtooth', 0.04, 110) }
export function sfxPoint(): void { tone(520, 0.12, 'triangle', 0.06) }
export function sfxGame(): void { tone(620, 0.2, 'triangle', 0.07); setTimeout(() => tone(780, 0.25, 'triangle', 0.07), 130) }
export function sfxWin(): void { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.07), i * 140)) }
export function sfxLose(): void { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.06), i * 160)) }
