import { TICK } from './physics'
import { GameState, makeGame, startMatch, tickGame, applySwipe } from './game'
import { buildScene, renderFrame, resize, adaptQuality, SceneRefs } from './scene'
import { attachInput, SwipeTracker } from './input'
import {
  initAudio, setSound, soundOn,
  sfxPaddle, sfxBounce, sfxNet, sfxPoint, sfxGame, sfxWin, sfxLose,
} from './audio'

const canvas = document.getElementById('game') as HTMLCanvasElement
const g: GameState = makeGame()
;(window as any).__g = g
const refs: SceneRefs = buildScene(canvas)

// ---- HUD elements (updated only on change) ----
const el = (id: string) => document.getElementById(id)!
const ptsYou = el('pts-you'), ptsOpp = el('pts-opp')
const gamesYou = el('games-you'), gamesOpp = el('games-opp')
const serveYou = el('serve-you'), serveOpp = el('serve-opp')
const msgEl = el('message')
const staminaFill = el('stamina-fill')
const menu = el('menu')
const playBtn = el('play')
const soundBtn = el('sound')
const diffRow = el('difficulty')

let hudCache = { py: -1, pc: -1, gy: -1, gc: -1, server: 0, msg: '', msgShown: false, stam: -1 }

function updateHUD(): void {
  const c = hudCache
  if (g.points.you !== c.py) { ptsYou.textContent = String(g.points.you); c.py = g.points.you }
  if (g.points.cpu !== c.pc) { ptsOpp.textContent = String(g.points.cpu); c.pc = g.points.cpu }
  if (g.games.you !== c.gy) { gamesYou.textContent = String(g.games.you); c.gy = g.games.you }
  if (g.games.cpu !== c.gc) { gamesOpp.textContent = String(g.games.cpu); c.gc = g.games.cpu }
  if (g.server !== c.server) {
    serveYou.classList.toggle('on', g.server === 1)
    serveOpp.classList.toggle('on', g.server === -1)
    c.server = g.server
  }
  const showMsg = g.msgTimer > 0 && g.msg !== ''
  if (showMsg !== c.msgShown || (showMsg && g.msg !== c.msg)) {
    msgEl.textContent = g.msg
    msgEl.classList.toggle('show', showMsg)
    msgEl.classList.toggle('big', g.msgBig)
    c.msg = g.msg
    c.msgShown = showMsg
  }
  const stam = Math.round(g.you.stamina * 20) / 20
  if (stam !== c.stam) {
    staminaFill.style.width = `${stam * 100}%`
    staminaFill.style.backgroundColor = stam > 0.5 ? '#57d98a' : stam > 0.3 ? '#f6c945' : '#f65945'
    c.stam = stam
  }
}

// ---- menu ----
let difficulty = 1
diffRow.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button')
  if (!btn) return
  difficulty = Number(btn.dataset.d)
  diffRow.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b === btn))
})
playBtn.addEventListener('click', () => {
  initAudio()
  menu.classList.add('hidden')
  startMatch(g, difficulty)
})
soundBtn.addEventListener('click', () => {
  setSound(!soundOn)
  soundBtn.textContent = `Sound: ${soundOn ? 'ON' : 'OFF'}`
})

// ---- input ----
const tracker: SwipeTracker = { active: false, startX: 0, startY: 0, curX: 0, curY: 0, startT: 0 }
attachInput(canvas, (s) => {
  applySwipe(g, s)
}, () => {
  // tap: return to menu after match over
  if (g.phase === 'matchover') {
    menu.classList.remove('hidden')
    g.phase = 'menu'
  }
}, tracker)

// ---- events -> sfx ----
function playEvents(bits: number): void {
  if (bits & 1) sfxPaddle()
  if (bits & 2) sfxBounce()
  if (bits & 4) sfxNet()
  if (bits & 32) sfxWin()
  else if (bits & 64) sfxLose()
  else if (bits & 16) sfxGame()
  else if (bits & 8) sfxPoint()
}

// ---- live swipe feedback: aim ring shows predicted landing while dragging ----
function updateAimMarker(): void {
  const m = refs.aimMarker
  if (tracker.active) {
    const dim = Math.min(window.innerWidth, window.innerHeight)
    const dx = tracker.curX - tracker.startX
    const dy = tracker.curY - tracker.startY
    const len = Math.hypot(dx, dy) / dim
    if (len > 0.02) {
      const aimX = Math.max(-1, Math.min(1, (dx / dim) * 3.2))
      const power = Math.min(1, len * 1.6)
      const depth = 0.3 + power * (2.74 / 2 - 0.42)
      m.position.x = aimX * (1.525 / 2 - 0.12)
      m.position.z = -depth
      m.visible = true
      const s = 0.8 + power * 0.8
      m.scale.set(s, s, s)
      return
    }
  }
  if (g.pending.active) {
    const depth = 0.3 + g.pending.power * (2.74 / 2 - 0.42)
    m.position.x = g.pending.aimX * (1.525 / 2 - 0.12)
    m.position.z = -depth
    m.visible = true
    return
  }
  m.visible = false
}

// ---- fixed-timestep loop ----
const STEP_MS = TICK * 1000 // 10ms
let last = performance.now()
let acc = 0

function frame(now: number): void {
  requestAnimationFrame(frame)
  let dt = now - last
  last = now
  if (dt > 100) dt = 100 // tab was hidden; don't spiral
  acc += dt
  let events = 0
  while (acc >= STEP_MS) {
    tickGame(g)
    events |= g.events
    acc -= STEP_MS
  }
  if (events) playEvents(events)
  updateHUD()
  updateAimMarker()
  renderFrame(refs, g, acc / STEP_MS)
  adaptQuality(refs, dt)
}
requestAnimationFrame(frame)

window.addEventListener('resize', () => resize(refs))
document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0 })
