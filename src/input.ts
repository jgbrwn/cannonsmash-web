// Touch/mouse swipe input.
// A swipe = press, drag, release. On release we compute:
//   aimX  : horizontal displacement -> where on the opponent side to aim (-1..1)
//   power : swipe length+speed -> shot depth/pace (0..1)
//   spin  : vertical direction  -> up = topspin (+), down = backspin (-)
import { SwipeShot } from './game'

export interface SwipeTracker {
  active: boolean
  startX: number; startY: number
  curX: number; curY: number
  startT: number
}

export function attachInput(
  el: HTMLElement,
  onSwipe: (s: SwipeShot) => void,
  onTap: () => void,
  tracker: SwipeTracker,
): void {
  const down = (x: number, y: number) => {
    tracker.active = true
    tracker.startX = tracker.curX = x
    tracker.startY = tracker.curY = y
    tracker.startT = performance.now()
  }
  const move = (x: number, y: number) => {
    if (!tracker.active) return
    tracker.curX = x
    tracker.curY = y
  }
  const up = (x: number, y: number) => {
    if (!tracker.active) return
    tracker.active = false
    const dx = x - tracker.startX
    const dy = y - tracker.startY
    const dt = Math.max(40, performance.now() - tracker.startT)
    const dim = Math.min(window.innerWidth, window.innerHeight)
    const len = Math.hypot(dx, dy) / dim // normalized swipe length
    if (len < 0.03 && dt < 300) { onTap(); return }
    if (len < 0.04) return
    const speed = len / (dt / 1000) // screen-heights per second
    const power = Math.min(1, len * 1.6 + Math.min(0.5, speed * 0.12))
    const aimX = Math.max(-1, Math.min(1, (dx / dim) * 3.2))
    // vertical: up (negative dy) = topspin
    const vert = -dy / dim
    const spin = Math.max(-1, Math.min(1, vert * 2.6))
    onSwipe({ aimX, power, spin })
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
  el.addEventListener('touchcancel', () => { tracker.active = false })

  // mouse fallback for desktop testing
  el.addEventListener('mousedown', (e) => down(e.clientX, e.clientY))
  el.addEventListener('mousemove', (e) => move(e.clientX, e.clientY))
  el.addEventListener('mouseup', (e) => up(e.clientX, e.clientY))
}
