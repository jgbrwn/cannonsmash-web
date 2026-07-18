// Touch/mouse input.
// - Touch + drag side to side: moves your player/paddle laterally (reported
//   as total horizontal displacement since the drag started).
// - Flick (fast release, mostly vertical): swing. Flick direction aims the
//   return (up-left / up-right), flick speed+length = power, vertical
//   direction = spin (up: topspin drive, down: backspin push).
// - Tap: UI action (continue after match).
import { SwipeShot } from './game'

export interface InputHandlers {
  onDragStart(): void
  onDrag(dxNorm: number): void // horizontal delta since drag start, / min screen dim
  onDragEnd(): void
  onFlick(s: SwipeShot): void
  onTap(): void
}

interface Sample { x: number; y: number; t: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export function attachInput(el: HTMLElement, h: InputHandlers): void {
  let active = false
  let startX = 0, startY = 0, startT = 0
  const samples: Sample[] = []

  const down = (x: number, y: number) => {
    active = true
    startX = x; startY = y
    startT = performance.now()
    samples.length = 0
    samples.push({ x, y, t: startT })
    h.onDragStart()
  }

  const move = (x: number, y: number) => {
    if (!active) return
    const t = performance.now()
    samples.push({ x, y, t })
    if (samples.length > 24) samples.shift()
    const dim = Math.min(window.innerWidth, window.innerHeight)
    h.onDrag((x - startX) / dim)
  }

  const up = (x: number, y: number) => {
    if (!active) return
    active = false
    const now = performance.now()
    const dim = Math.min(window.innerWidth, window.innerHeight)

    // Flick detection: look at motion over the last ~130ms before release.
    let i = samples.length - 1
    while (i > 0 && now - samples[i - 1].t <= 130) i--
    const s0 = samples[Math.max(0, i)]
    const fdx = x - s0.x
    const fdy = y - s0.y
    const fdt = Math.max(16, now - s0.t)
    const flickLen = Math.hypot(fdx, fdy) / dim
    const flickSpeed = flickLen / (fdt / 1000) // screen-dims per second
    const vertical = Math.abs(fdy) > Math.abs(fdx) * 0.4

    const totalLen = Math.hypot(x - startX, y - startY) / dim

    if (flickSpeed > 1.0 && flickLen > 0.04 && vertical) {
      // aim from flick angle: horizontal component vs vertical
      const aimX = clamp((fdx / Math.max(1, Math.abs(fdy))) * 1.6, -1, 1)
      const power = clamp(flickLen * 1.3 + flickSpeed * 0.09, 0.2, 1)
      const spin = clamp(-fdy / dim * 3.0, -1, 1) // up = topspin (+), down = backspin (-)
      h.onFlick({ aimX, power, spin })
    } else if (totalLen < 0.03 && now - startT < 300) {
      h.onTap()
    }
    h.onDragEnd()
  }

  el.addEventListener('touchstart', (e) => {
    e.preventDefault()
    const t = e.changedTouches[0]
    down(t.clientX, t.clientY)
  }, { passive: false })
  el.addEventListener('touchmove', (e) => {
    e.preventDefault()
    const t = e.changedTouches[0]
    move(t.clientX, t.clientY)
  }, { passive: false })
  el.addEventListener('touchend', (e) => {
    e.preventDefault()
    const t = e.changedTouches[0]
    up(t.clientX, t.clientY)
  }, { passive: false })
  el.addEventListener('touchcancel', () => { active = false; h.onDragEnd() })

  // mouse fallback for desktop testing
  el.addEventListener('mousedown', (e) => down(e.clientX, e.clientY))
  el.addEventListener('mousemove', (e) => move(e.clientX, e.clientY))
  el.addEventListener('mouseup', (e) => up(e.clientX, e.clientY))
  el.addEventListener('mouseleave', () => { if (active) { active = false; h.onDragEnd() } })
}
