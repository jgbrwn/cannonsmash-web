// Game state, players, AI, scoring. Framework-free; mutates in place.
import {
  Ball, ContactPrediction, Shot, TABLE_HEIGHT, TABLE_LENGTH, TABLE_WIDTH, TICK,
  makeBall, predictContact, stepBall, targetToV, targetToVS,
} from './physics'

export type Phase = 'menu' | 'serve' | 'rally' | 'point' | 'gameover' | 'matchover'

export interface SwipeShot {
  aimX: number      // -1..1 across table
  power: number     // 0..1
  spin: number      // -1..1 (up=top, down=back)
}

export interface PlayerG {
  side: number            // +1 near (you), -1 far (cpu)
  x: number; y: number    // feet position
  vx: number; vy: number
  targetX: number; targetY: number
  swingT: number          // >0 while swinging (ticks since start), impact at SWING_IMPACT
  swingHand: number       // +1 forehand(right), -1 backhand(left)
  stamina: number
  paddleZ: number         // visual paddle height hint
}

export const SWING_TICKS = 50
export const SWING_IMPACT = 20

const HOME_Y = TABLE_LENGTH / 2 + 0.4
const REACH = 0.55

export function makePlayer(side: number): PlayerG {
  return {
    side, x: 0, y: side > 0 ? -HOME_Y : HOME_Y, vx: 0, vy: 0,
    targetX: 0, targetY: side > 0 ? -HOME_Y : HOME_Y,
    swingT: 0, swingHand: 1, stamina: 1, paddleZ: TABLE_HEIGHT + 0.25,
  }
}

export interface PendingHit {
  active: boolean
  aimX: number
  power: number
  spin: number
  quality: number    // timing quality 0..1
  swipeTick: number  // game tick of the swipe
}

export interface GameState {
  phase: Phase
  ball: Ball
  prevStatus: number
  you: PlayerG
  cpu: PlayerG
  lastHitter: number       // side of last player to strike the ball
  server: number           // side serving (+1 you)
  points: { you: number; cpu: number }
  games: { you: number; cpu: number }
  totalPoints: number      // for serve rotation within a game
  pointTimer: number       // ticks left in between-point pause
  tick: number
  difficulty: number       // 0 easy 1 normal 2 hard
  pending: PendingHit      // your queued swipe
  cpuPlan: { swingAt: number; aimX: number; aimY: number; level: number; spin: number; active: boolean }
  contactYou: ContactPrediction
  contactCpu: ContactPrediction
  serveTossed: boolean
  msg: string
  msgBig: boolean
  msgTimer: number
  events: number           // bitmask of sounds this tick: 1 paddle,2 bounce,4 net,8 point,16 game,32 match win,64 match lose
  youWonMatch: boolean
}

export function makeGame(): GameState {
  return {
    phase: 'menu',
    ball: makeBall(),
    prevStatus: 8,
    you: makePlayer(1),
    cpu: makePlayer(-1),
    lastHitter: 0,
    server: 1,
    points: { you: 0, cpu: 0 },
    games: { you: 0, cpu: 0 },
    totalPoints: 0,
    pointTimer: 0,
    tick: 0,
    difficulty: 1,
    pending: { active: false, aimX: 0, power: 0, spin: 0, quality: 0, swipeTick: 0 },
    cpuPlan: { swingAt: 0, aimX: 0, aimY: 0, level: 0, spin: 0, active: false },
    contactYou: { x: 0, y: 0, z: 0, ticks: 0, valid: false },
    contactCpu: { x: 0, y: 0, z: 0, ticks: 0, valid: false },
    serveTossed: false,
    msg: '', msgBig: false, msgTimer: 0,
    events: 0,
    youWonMatch: false,
  }
}

const shotScratch: Shot = { vx: 0, vy: 0, vz: 0 }

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function startMatch(g: GameState, difficulty: number): void {
  g.difficulty = difficulty
  g.points.you = 0; g.points.cpu = 0
  g.games.you = 0; g.games.cpu = 0
  g.totalPoints = 0
  g.server = 1
  g.youWonMatch = false
  resetRally(g)
  setMsg(g, 'Your serve — swipe to serve', false, 300)
}

function resetRally(g: GameState): void {
  const b = g.ball
  b.status = 8
  b.spin = 0
  b.vx = 0; b.vy = 0; b.vz = 0
  const sv = g.server
  // ball rests at server's paddle position
  b.x = sv * 0.25
  b.y = sv > 0 ? -(TABLE_LENGTH / 2 + 0.25) : (TABLE_LENGTH / 2 + 0.25)
  b.z = TABLE_HEIGHT + 0.22
  g.you.x = 0.25; g.you.y = -HOME_Y; g.you.targetX = sv > 0 ? 0.25 : 0; g.you.targetY = -HOME_Y
  g.cpu.x = -0.25; g.cpu.y = HOME_Y; g.cpu.targetX = sv < 0 ? -0.25 : 0; g.cpu.targetY = HOME_Y
  g.you.swingT = 0; g.cpu.swingT = 0
  g.pending.active = false
  g.cpuPlan.active = false
  g.serveTossed = false
  g.lastHitter = 0
  g.phase = 'serve'
  g.contactYou.valid = false
  g.contactCpu.valid = false
}

export function setMsg(g: GameState, text: string, big = false, ticks = 150): void {
  g.msg = text
  g.msgBig = big
  g.msgTimer = ticks
}

// ---------- your input ----------

// Swipe while serving: toss + schedule serve hit.
// Swipe during rally: queue the hit for next contact.
export function applySwipe(g: GameState, s: SwipeShot): void {
  if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8) {
    // toss
    g.ball.vz = 2.4
    g.ball.status = 6
    g.serveTossed = true
    g.pending.active = true
    g.pending.aimX = s.aimX
    g.pending.power = s.power
    g.pending.spin = s.spin
    g.pending.quality = 1
    g.pending.swipeTick = g.tick
    return
  }
  if (g.phase !== 'rally') return
  const st = g.ball.status
  // only meaningful when ball is coming to you (2 in-flight, 3 hittable, 5 cpu serve in flight)
  if (st !== 2 && st !== 3 && st !== 5) return
  g.pending.active = true
  g.pending.aimX = s.aimX
  g.pending.power = s.power
  g.pending.spin = s.spin
  g.pending.swipeTick = g.tick
  // quality computed at contact from timing
}

// ---------- CPU ----------

function cpuChooseServe(g: GameState): void {
  const d = g.difficulty
  const r = Math.random()
  // mix of short backspin and long fast serves
  const short = r < (d === 0 ? 0.3 : 0.5)
  g.cpuPlan.aimX = (Math.random() - 0.5) * (TABLE_WIDTH - 0.35)
  g.cpuPlan.aimY = short ? -(0.35 + Math.random() * 0.35) : -(0.9 + Math.random() * 0.35)
  g.cpuPlan.level = short ? 0.55 : 0.72 + d * 0.06
  g.cpuPlan.spin = short ? -0.35 : 0.15
  g.cpuPlan.active = true
}

function cpuChooseReturn(g: GameState): void {
  const d = g.difficulty
  const c = g.contactCpu
  const high = c.z > TABLE_HEIGHT + 0.3
  // aim away from where you stand
  const youX = g.you.x
  let aimX = (Math.random() < 0.65 ? -Math.sign(youX || (Math.random() - 0.5)) : Math.sign(youX)) *
    (0.15 + Math.random() * 0.45)
  aimX = clamp(aimX, -TABLE_WIDTH / 2 + 0.12, TABLE_WIDTH / 2 - 0.12)
  const deep = Math.random() < 0.3 + d * 0.25
  const aimY = -(deep ? 0.95 + Math.random() * 0.3 : 0.5 + Math.random() * 0.4)
  let level = high ? 0.72 + d * 0.09 : 0.55 + d * 0.06
  let spin = high ? 0.35 : 0.1
  if (c.z < TABLE_HEIGHT + 0.16) { level = 0.5 + d * 0.04; spin = -0.25 } // low ball: push
  // easy CPU makes mistakes
  const err = d === 0 ? 0.16 : d === 1 ? 0.07 : 0.025
  g.cpuPlan.aimX = aimX + (Math.random() - 0.5) * err * 4
  g.cpuPlan.aimY = aimY
  g.cpuPlan.level = clamp(level + (Math.random() - 0.5) * err, 0.3, 0.96)
  g.cpuPlan.spin = spin
  g.cpuPlan.active = true
}

// ---------- hitting ----------

function strikeBall(g: GameState, p: PlayerG, aimX: number, aimY: number, level: number, spin: number, quality: number): boolean {
  const b = g.ball
  const isServe = b.status === 6 || b.status === 7
  const q = clamp(quality, 0, 1)
  const tx = clamp(aimX, -TABLE_WIDTH / 2 + 0.03, TABLE_WIDTH / 2 - 0.03)
  const tyMag = clamp(Math.abs(aimY), 0.15, TABLE_LENGTH / 2 - 0.03)
  const ty = p.side > 0 ? tyMag : -tyMag
  const lv = clamp(level, 0.25, 1)

  if (isServe) {
    const ok = targetToVS(b.x, b.y, b.z, tx, ty, clamp(level, 0.3, 0.95), spin, shotScratch)
    if (!ok) {
      targetToVS(b.x, b.y, b.z, tx * 0.5, p.side > 0 ? 0.8 : -0.8, 0.6, spin * 0.5, shotScratch)
    }
    b.vx = shotScratch.vx; b.vy = shotScratch.vy; b.vz = shotScratch.vz
    b.spin = spin
    b.status = b.status === 6 ? 4 : 5
  } else {
    // error model (original AddError spirit), tuned for touch play:
    // moderate mishits mostly shorten/soften the ball; only poor contact
    // (q < ~0.45) meaningfully risks the net or flying long.
    const mild = 1 - q
    const safeTy = p.side > 0
      ? clamp(ty - mild * 0.35, 0.2, TABLE_LENGTH / 2 - 0.05)
      : clamp(ty + mild * 0.35, -TABLE_LENGTH / 2 + 0.05, -0.2)
    const safeLv = clamp(lv * (1 - mild * 0.25), 0.25, 1)
    targetToV(b.x, b.y, b.z, tx, safeTy, safeLv, spin, shotScratch)
    const hard = Math.max(0, 0.45 - q) / 0.45 // 0..1 only when quality is poor
    const risk = hard * (0.4 + lv * 0.5)
    const rx = (Math.random() * 2 - 1) * (mild * 0.2 + risk)
    const ry = (Math.random() * 2 - 1) * risk
    const rz = (Math.random() * 2 - 1) * risk
    b.vx = shotScratch.vx * (1 + rx * 0.5) + rx * 0.35
    b.vy = shotScratch.vy * (1 + ry * 0.5)
    b.vz = shotScratch.vz * (1 + rz * 0.8) + rz * 0.5
    b.spin = spin
    if (b.status === 3) b.status = 0
    else if (b.status === 1) b.status = 2
  }
  g.lastHitter = p.side
  g.events |= 1
  return true
}

// ---------- movement ----------

function movePlayer(p: PlayerG, speed: number): void {
  const dx = p.targetX - p.x
  const dy = p.targetY - p.y
  const dist = Math.hypot(dx, dy)
  const step = speed * TICK
  if (dist <= step) { p.x = p.targetX; p.y = p.targetY; return }
  p.x += dx / dist * step
  p.y += dy / dist * step
}

function homeY(side: number): number { return side > 0 ? -HOME_Y : HOME_Y }

// ---------- scoring ----------

function awardPoint(g: GameState, youWin: boolean, reason: string): void {
  if (youWin) g.points.you++
  else g.points.cpu++
  g.totalPoints++
  g.events |= 8

  const py = g.points.you, pc = g.points.cpu
  const gameOver = (py >= 11 || pc >= 11) && Math.abs(py - pc) >= 2

  if (gameOver) {
    const youGame = py > pc
    if (youGame) g.games.you++
    else g.games.cpu++
    const matchOver = g.games.you >= 2 || g.games.cpu >= 2
    if (matchOver) {
      g.phase = 'matchover'
      g.youWonMatch = g.games.you >= 2
      g.events |= g.youWonMatch ? 32 : 64
      setMsg(g, g.youWonMatch ? 'YOU WIN THE MATCH! (tap to continue)' : 'CPU wins the match (tap to continue)', true, 100000)
    } else {
      g.phase = 'gameover'
      g.pointTimer = 250
      g.events |= 16
      setMsg(g, youGame ? `Game to you! ${py}–${pc}` : `Game to CPU ${pc}–${py}`, true, 260)
    }
    return
  }

  g.phase = 'point'
  g.pointTimer = 120
  setMsg(g, reason, false, 130)
}

function startNextGame(g: GameState): void {
  g.points.you = 0; g.points.cpu = 0
  g.totalPoints = 0
  g.server = (g.games.you + g.games.cpu) % 2 === 0 ? 1 : -1
  resetRally(g)
}

function rotateServe(g: GameState): void {
  const t = g.totalPoints
  const firstServer = (g.games.you + g.games.cpu) % 2 === 0 ? 1 : -1
  const deuce = g.points.you >= 10 && g.points.cpu >= 10
  const block = deuce ? t : Math.floor(t / 2)
  g.server = block % 2 === 0 ? firstServer : -firstServer
}

function resolveDeadBall(g: GameState): void {
  const st = g.prevStatus
  // Who wins? Depends on state when ball died.
  let youWin: boolean
  let reason: string
  if (st === 0 || st === 4 || st === 6) {
    // you hit (or served/tossed) and it never reached a legal bounce → you lose
    youWin = false
    reason = st === 6 ? 'Serve fault' : g.ball.hitNet ? 'Into the net' : 'Out!'
  } else if (st === 2 || st === 5 || st === 7) {
    youWin = true
    reason = g.ball.hitNet ? 'CPU nets it' : 'CPU misses!'
  } else if (st === 3) {
    // ball was yours to hit and died → you failed to return
    youWin = false
    reason = 'Missed it!'
  } else if (st === 1) {
    youWin = true
    reason = 'Winner!'
  } else {
    youWin = g.lastHitter !== 1
    reason = ''
  }
  awardPoint(g, youWin, reason)
}

// ---------- main tick ----------

export function tickGame(g: GameState): void {
  g.events = 0
  g.tick++
  if (g.msgTimer > 0) g.msgTimer--

  if (g.phase === 'menu' || g.phase === 'matchover') return

  if (g.phase === 'point' || g.phase === 'gameover') {
    g.pointTimer--
    if (g.pointTimer <= 0) {
      const wasGameOver = g.phase === 'gameover'
      if (wasGameOver) startNextGame(g)
      else { rotateServe(g); resetRally(g) }
      if (g.server === 1) setMsg(g, 'Your serve — swipe to serve', false, 200)
    }
    // keep animating players back home
    stepPlayers(g)
    return
  }

  const b = g.ball
  g.prevStatus = b.status >= 0 ? b.status : g.prevStatus

  // CPU serve start
  if (g.phase === 'serve' && g.server === -1 && b.status === 8) {
    if (!g.cpuPlan.active) {
      cpuChooseServe(g)
      g.cpuPlan.swingAt = g.tick + 90 + Math.floor(Math.random() * 50)
    } else if (g.tick >= g.cpuPlan.swingAt) {
      b.vz = 2.4
      b.status = 7
      g.cpu.swingT = 1
      g.cpuPlan.swingAt = g.tick + 34 // hit on the way down
    }
  }

  // CPU serve strike (after toss)
  if (b.status === 7 && g.cpuPlan.active && g.tick >= g.cpuPlan.swingAt && b.vz < 0) {
    strikeBall(g, g.cpu, g.cpuPlan.aimX, g.cpuPlan.aimY, g.cpuPlan.level, g.cpuPlan.spin, 1)
    g.cpuPlan.active = false
    g.phase = 'rally'
  }

  // Your serve strike (after your toss swipe)
  if (b.status === 6 && g.pending.active && b.vz < -0.4) {
    const p = g.pending
    const depth = 0.35 + p.power * (TABLE_LENGTH / 2 - 0.5)
    const level = 0.42 + p.power * 0.5
    const spin = p.spin * 0.6 - 0.05
    g.you.swingT = 1
    g.you.swingHand = p.aimX * (TABLE_WIDTH / 2) >= g.you.x ? 1 : -1
    strikeBall(g, g.you, p.aimX * (TABLE_WIDTH / 2 - 0.15), depth, level, spin, 1)
    g.pending.active = false
    g.phase = 'rally'
  }

  // physics
  const wasStatus = b.status
  stepBall(b)
  if (b.justBounced) g.events |= 2
  if (b.hitNet && wasStatus >= 0) { g.events |= 4; b.hitNet = false }

  if (b.status < 0) {
    resolveDeadBall(g)
    return
  }

  // contact predictions (only when relevant, cheap: reuses scratch)
  const stNow = b.status
  if (stNow === 2 || stNow === 3 || stNow === 5) predictContact(b, 1, g.contactYou)
  else g.contactYou.valid = false
  if (stNow === 0 || stNow === 1 || stNow === 4) predictContact(b, -1, g.contactCpu)
  else g.contactCpu.valid = false

  // ---- your assisted movement: drift toward predicted contact ----
  const you = g.you
  if (g.contactYou.valid) {
    you.targetX = clamp(g.contactYou.x, -TABLE_WIDTH / 2 - 0.6, TABLE_WIDTH / 2 + 0.6)
    you.targetY = clamp(g.contactYou.y - 0.35, -TABLE_LENGTH / 2 - 1.9, -0.4)
  } else if (stNow !== 6 && stNow !== 8) {
    you.targetX = you.targetX * 0.995
    you.targetY = homeY(1)
  }

  // ---- your queued hit resolves at contact ----
  if (g.pending.active && (stNow === 3 || stNow === 2 || stNow === 5)) {
    if (stNow === 3) {
      const dx = b.x - you.x
      const dy = b.y - you.y
      const near = Math.abs(dy) < 0.42 && Math.abs(dx) < REACH + 0.25 &&
        b.z > TABLE_HEIGHT - 0.12 && b.z < TABLE_HEIGHT + 1.05
      // hit when ball reaches strike depth near the player, or is about to pass
      const passing = b.y < you.y + 0.05 && b.vy < 0
      if (passing && Math.abs(dx) > REACH + 0.4) {
        // ball is out of reach — swing and miss
        you.swingT = 1
        you.swingHand = dx >= 0 ? 1 : -1
        g.pending.active = false
      } else if (near || passing) {
        const p = g.pending
        // timing quality: reward swipes made 100-550ms before contact;
        // very early swipes still work but weaker
        const waited = g.tick - p.swipeTick
        const q = waited < 3 ? 0.8 : waited <= 70 ? 1.0 : Math.max(0.5, 1 - (waited - 70) * 0.01)
        const reachPenalty = clamp(1 - Math.max(0, Math.abs(dx) - REACH) / 0.4, 0, 1)
        const late = passing && !near ? 0.55 : 1
        const quality = q * (0.55 + reachPenalty * 0.45) * late * (0.75 + you.stamina * 0.25)
        const depth = 0.3 + p.power * (TABLE_LENGTH / 2 - 0.42)
        const level = 0.42 + p.power * 0.48 + (p.spin > 0.3 ? 0.05 : 0)
        const spin = p.spin > 0.25 ? 0.3 + p.spin * 0.4 : p.spin < -0.25 ? -0.25 + p.spin * 0.3 : 0.08
        you.swingT = 1
        you.swingHand = b.x >= you.x ? 1 : -1
        you.stamina = clamp(you.stamina - 0.05 - p.power * 0.05, 0.15, 1)
        strikeBall(g, you, p.aimX * (TABLE_WIDTH / 2 - 0.12), depth, level, spin, quality)
        p.active = false
      }
    }
  }
  // swipe expired without ball ever being hittable → drop it when rally ends naturally

  // ---- CPU rally behaviour ----
  const cpu = g.cpu
  if (g.contactCpu.valid) {
    cpu.targetX = clamp(g.contactCpu.x, -TABLE_WIDTH / 2 - 0.6, TABLE_WIDTH / 2 + 0.6)
    cpu.targetY = clamp(g.contactCpu.y + 0.35, 0.4, TABLE_LENGTH / 2 + 1.9)
    if (stNow === 1 && !g.cpuPlan.active) {
      cpuChooseReturn(g)
      // swing so impact lands at predicted contact
      g.cpuPlan.swingAt = g.tick + Math.max(1, g.contactCpu.ticks - 4)
    }
  } else if (stNow !== 7 && stNow !== 8) {
    cpu.targetX *= 0.995
    cpu.targetY = homeY(-1)
    if (stNow !== 1) g.cpuPlan.active = false
  }

  if (g.cpuPlan.active && stNow === 1 && g.tick >= g.cpuPlan.swingAt) {
    const dx = b.x - cpu.x
    const reachOk = Math.abs(dx) < REACH + (g.difficulty === 2 ? 0.45 : 0.3) &&
      Math.abs(b.y - cpu.y) < 0.6 && b.z > TABLE_HEIGHT - 0.15 && b.z < TABLE_HEIGHT + 1.1
    if (reachOk) {
      const whiff = Math.random() < (g.difficulty === 0 ? 0.07 : g.difficulty === 1 ? 0.025 : 0.012)
      cpu.swingT = 1
      cpu.swingHand = b.x >= cpu.x ? -1 : 1
      if (!whiff) {
        // CPU unforced errors: sometimes genuinely bad contact that flies long/nets
        const errRate = g.difficulty === 0 ? 0.3 : g.difficulty === 1 ? 0.14 : 0.05
        if (Math.random() < errRate) {
          const q = 0.05 + Math.random() * 0.2
          strikeBall(g, cpu, g.cpuPlan.aimX, g.cpuPlan.aimY * (1.15 + Math.random() * 0.4), clamp(g.cpuPlan.level * 1.35, 0.3, 1), g.cpuPlan.spin, q)
        } else {
          const q = g.difficulty === 0 ? 0.6 + Math.random() * 0.3 : g.difficulty === 1 ? 0.75 + Math.random() * 0.25 : 0.88 + Math.random() * 0.12
          strikeBall(g, cpu, g.cpuPlan.aimX, g.cpuPlan.aimY, g.cpuPlan.level, g.cpuPlan.spin, q)
        }
        g.cpuPlan.active = false
      } else {
        // whiffed: keep the plan "active" with an unreachable swing time so the
        // CPU doesn't replan and rescue the ball — the point is lost.
        g.cpuPlan.swingAt = g.tick + 100000
      }
    } else if (b.y < cpu.y - 0.2 || b.vy < 0) {
      // can't reach in time; wait one more tick unless it's passed
      if (b.y > cpu.y + 0.5) g.cpuPlan.active = false
    }
  }

  stepPlayers(g)

  // stamina recovery
  you.stamina = clamp(you.stamina + 0.0006, 0, 1)

  // serve gets stuck / toss never hit
  if ((stNow === 6 || stNow === 7) && b.z < TABLE_HEIGHT - 0.1) {
    b.status = -1
    g.prevStatus = stNow
    resolveDeadBall(g)
  }
}

function stepPlayers(g: GameState): void {
  const spd = 3.4
  movePlayer(g.you, spd)
  movePlayer(g.cpu, spd * (g.difficulty === 0 ? 0.7 : g.difficulty === 1 ? 0.95 : 1.15))
  if (g.you.swingT > 0) { g.you.swingT++; if (g.you.swingT > SWING_TICKS) g.you.swingT = 0 }
  if (g.cpu.swingT > 0) { g.cpu.swingT++; if (g.cpu.swingT > SWING_TICKS) g.cpu.swingT = 0 }
}
