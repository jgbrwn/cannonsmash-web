export const TICK = 0.01
export const TABLE = {
  length: 2.74,
  width: 1.525,
  height: 0.76,
  netHeight: 0.1525,
  ballRadius: 0.019,
}
export const ARENA = {
  x: 8.0,
  y: 12.0,
  z: 6.0,
}
export const TABLE_E = 0.8
export const PHY = 0.15

export type BallStatus = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface BallState {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  spin: number
  status: BallStatus
}

export interface ShotSolution {
  vx: number
  vy: number
  vz: number
  targetX: number
  targetY: number
  spin: number
  level: number
  isServe: boolean
}

export const gravity = (spin: number) => 9.8 + spin * 5

export function createIdleBall(): BallState {
  return {
    x: 0,
    y: -0.9,
    z: TABLE.height + 0.28,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    status: 8,
  }
}

export function createDemoBall(): BallState {
  return {
    x: 0,
    y: -0.9,
    z: TABLE.height + 0.35,
    vx: 0.7,
    vy: 4.6,
    vz: 2.2,
    spin: 0.35,
    status: 0,
  }
}

export function cloneBall(ball: BallState): BallState {
  return { ...ball }
}

function safeLog(f: number): number {
  if (f <= 0) return -1e11
  return Math.log(f)
}

export function stepBall(ball: BallState): BallState {
  const b = { ...ball }
  if (b.status < 0 || b.status === 8) return b

  const px = b.x, py = b.y, pz = b.z
  b.x += (b.vx * 2 - PHY * b.vx * TICK) / 2 * TICK
  b.y += (b.vy * 2 - PHY * b.vy * TICK) / 2 * TICK
  b.z += (b.vz * 2 - gravity(b.spin) * TICK - PHY * b.vz * TICK) / 2 * TICK

  let netT = TICK * 100
  if (py * b.y <= 0.0) {
    netT = Math.abs(py / ((b.y - py) / TICK))
    const nz = pz + (b.z - pz) * netT / TICK
    const nx = px + (b.x - px) * netT / TICK
    if (nz < TABLE.height || nz > TABLE.height + TABLE.netHeight || nx < -TABLE.width / 2 - TABLE.netHeight || nx > TABLE.width / 2 + TABLE.netHeight) {
      netT = TICK * 100
    }
  }

  let tableT = TICK * 100
  if ((pz - TABLE.height) * (b.z - TABLE.height) <= 0.0) {
    tableT = Math.abs((pz - TABLE.height) / ((b.z - pz) / TICK))
    const ty = py + (b.y - py) * tableT / TICK
    const tx = px + (b.x - px) * tableT / TICK
    if (tableT <= 0.0 || ty < -TABLE.length / 2 || ty > TABLE.length / 2 || tx < -TABLE.width / 2 || tx > TABLE.width / 2) {
      tableT = TICK * 100
    }
  }

  if (netT < tableT) {
    b.vx *= 0.5
    b.vy = -b.vy * 0.2
    b.spin = -b.spin * 0.8
    b.y = b.vy * (TICK - netT)
  }

  if (tableT < netT) {
    const tableY = py + b.vy * tableT
    if (tableY < 0) {
      if (b.status === 2) b.status = 3
      else if (b.status === 4) b.status = 0
      else b.status = -1
    } else {
      if (b.status === 0) b.status = 1
      else if (b.status === 5) b.status = 2
      else b.status = -1
    }

    b.vz -= gravity(b.spin) * tableT
    b.vz += -PHY * b.vz * tableT
    b.vz *= -TABLE_E
    b.z = TABLE.height + (TICK - tableT) * b.vz
    b.vz -= gravity(b.spin) * (TICK - tableT)
    b.vz += -PHY * b.vz * (TICK - tableT)

    b.vy += -PHY * b.vy * tableT
    if (b.vy > 0) b.vy += b.spin * 0.8
    else b.vy -= b.spin * 0.8
    b.vy += -PHY * b.vy * (TICK - tableT)
    b.vx += -PHY * b.vx * TICK
    b.spin *= 0.8
    return b
  }

  if (b.x < -ARENA.x / 2 || b.x > ARENA.x / 2 || b.y < -ARENA.y / 2 || b.y > ARENA.y / 2 || b.z < 0 || b.z > ARENA.z) {
    b.status = -1
    return b
  }

  b.vz -= gravity(b.spin) * TICK
  b.vx += -PHY * b.vx * TICK
  b.vy += -PHY * b.vy * TICK
  b.vz += -PHY * b.vz * TICK
  return b
}

export function sampleTrajectory(initial: BallState, steps = 600): BallState[] {
  const out = [cloneBall(initial)]
  let cur = cloneBall(initial)
  for (let i = 0; i < steps; i++) {
    cur = stepBall(cur)
    out.push(cloneBall(cur))
    if (cur.status < 0) break
  }
  return out
}

export function applyShot(ball: BallState, shot: ShotSolution): BallState {
  const next = cloneBall(ball)
  next.vx = shot.vx
  next.vy = shot.vy
  next.vz = shot.vz
  next.spin = shot.spin
  if (next.status === 6) next.status = 4
  else if (next.status === 7) next.status = 5
  else if (next.status === 3) next.status = 0
  else if (next.status === 1) next.status = 2
  return next
}

export function tossForServe(side: 1 | -1): BallState {
  return {
    x: side > 0 ? 0.3 : -0.3,
    y: side > 0 ? -TABLE.length / 2 : TABLE.length / 2,
    z: TABLE.height + 0.15,
    vx: 0,
    vy: 0,
    vz: 2.5,
    spin: 0,
    status: side > 0 ? 6 : 7,
  }
}

export function solveTargetToV(
  ball: BallState,
  targetX: number,
  targetY: number,
  level: number,
  spin: number,
  vMin = 0.1,
  vMax = 30.0,
): ShotSolution {
  let y: number
  let vy = 0
  let vz = 0
  const vyMin = vMin
  let vyMax = Math.abs(targetY - ball.y) / Math.hypot(targetX - ball.x, targetY - ball.y) * vMax

  if (targetY < ball.y) {
    y = -ball.y
    targetY = -targetY
  } else {
    y = ball.y
  }

  if (targetY * y >= 0) {
    vy = vyMax * level * 0.5
    const t2 = -safeLog(1 - PHY * (targetY - y) / vy) / PHY
    const vx = t2 !== 0 ? PHY * (targetX - ball.x) / (1 - Math.exp(-PHY * t2)) : ball.x
    vz = t2 !== 0
      ? (PHY * (TABLE.height - ball.z) + gravity(spin) * t2) / (1 - Math.exp(-PHY * t2)) - gravity(spin) / PHY
      : ball.z
    if (y !== ball.y) vy = -vy
    return { vx, vy, vz, targetX, targetY: y !== ball.y ? -targetY : targetY, spin, level, isServe: false }
  }

  let lo = vyMin
  let hi = vyMax
  while (hi - lo > 0.001) {
    vy = (lo + hi) / 2
    const t2 = -safeLog(1 - PHY * (targetY - y) / vy) / PHY
    const t1 = -safeLog(1 - PHY * (-y) / vy) / PHY
    vz = t2 !== 0
      ? (PHY * (TABLE.height - ball.z) + gravity(spin) * t2) / (1 - Math.exp(-PHY * t2)) - gravity(spin) / PHY
      : ball.z
    const z1 = -(vz + gravity(spin) / PHY) * Math.exp(-PHY * t1) / PHY - gravity(spin) * t1 / PHY + (vz + gravity(spin) / PHY) / PHY
    if (z1 < TABLE.height + TABLE.netHeight - ball.z) hi = vy
    else lo = vy
  }

  vy *= level
  const t2 = -safeLog(1 - PHY * (targetY - y) / vy) / PHY
  vz = t2 !== 0
    ? (PHY * (TABLE.height - ball.z) + gravity(spin) * t2) / (1 - Math.exp(-PHY * t2)) - gravity(spin) / PHY
    : ball.z
  if (y !== ball.y) vy = -vy
  const vx = PHY * (targetX - ball.x) / (1 - Math.exp(-PHY * t2))
  return { vx, vy, vz, targetX, targetY: y !== ball.y ? -targetY : targetY, spin, level, isServe: false }
}

export function solveTargetToVS(
  ball: BallState,
  targetX: number,
  targetY: number,
  level: number,
  spin: number,
): ShotSolution {
  let y: number
  let tmpVX = 0, tmpVY = 0, tmpVZ = 0

  if (targetY < ball.y) {
    y = -ball.y
    targetY = -targetY
  } else {
    y = ball.y
  }

  for (let boundY = -TABLE.length / 2; boundY < 0; boundY += TICK) {
    let lo = 0.1
    let hi = 30.0
    let vyCurrent = 0
    let vzCurrent = 0
    let vy = 0
    let vz = 0
    let z = 0
    let t1 = 0
    let t2 = 0

    while (hi - lo > 0.001) {
      vy = (lo + hi) / 2
      t2 = -safeLog(1 - PHY * (boundY - y) / vy) / PHY
      vz = t2 !== 0
        ? (PHY * (TABLE.height - ball.z) + gravity(spin) * t2) / (1 - Math.exp(-PHY * t2)) - gravity(spin) / PHY
        : ball.z

      vyCurrent = vy * Math.exp(-PHY * t2)
      vzCurrent = (vz + gravity(spin) / PHY) * Math.exp(-PHY * t2) - gravity(spin) / PHY
      vyCurrent += spin * 0.8
      vzCurrent *= -TABLE_E

      t1 = -safeLog(1 - PHY * (targetY - boundY) / vyCurrent) / PHY
      z = -(vzCurrent + gravity(spin * 0.8) / PHY) * Math.exp(-PHY * t1) / PHY - gravity(spin * 0.8) / PHY * t1 + (vzCurrent + gravity(spin * 0.8) / PHY) / PHY

      if (z > 0) hi = vy
      else lo = vy
    }

    if (Math.abs(z) < TICK) {
      const t3 = -safeLog(1 - PHY * (-boundY) / vyCurrent) / PHY
      z = -(vzCurrent + gravity(spin * 0.8) / PHY) * Math.exp(-PHY * t3) / PHY - gravity(spin * 0.8) / PHY * t3 + (vzCurrent + gravity(spin * 0.8) / PHY) / PHY
      if (z > TABLE.netHeight + (1.0 - level) * 0.1) {
        if (vy > tmpVY) {
          tmpVX = (t1 + t2) !== 0 ? PHY * (targetX - ball.x) / (1 - Math.exp(-PHY * (t1 + t2))) : 0
          tmpVY = vy
          tmpVZ = vz
        }
      }
    }
  }

  const vy = y !== ball.y ? -tmpVY : tmpVY
  return { vx: tmpVX, vy, vz: tmpVZ, targetX, targetY: y !== ball.y ? -targetY : targetY, spin, level, isServe: true }
}

export function findTableBounce(path: BallState[]): BallState | undefined {
  return path.find((p, i) => i > 0 && Math.abs(p.z - TABLE.height) < 0.03 && Math.abs(p.x) <= TABLE.width / 2 && Math.abs(p.y) <= TABLE.length / 2)
}

export type PlayerSide = 1 | -1
export type SwingState = 'idle' | 'backswing' | 'impact' | 'recovery'

export interface PlayerState {
  side: PlayerSide
  x: number
  y: number
  z: number
  targetX: number
  targetY: number
  swingTimer: number
  swingState: SwingState
  requestedShot: ShotSolution | null
  lastImpactTimer: number | null
}

export function createPlayer(side: PlayerSide): PlayerState {
  return {
    side,
    x: 0,
    y: side > 0 ? -TABLE.length / 2 - 0.22 : TABLE.length / 2 + 0.22,
    z: 1.05,
    targetX: 0,
    targetY: TABLE.length / 4 * side,
    swingTimer: 0,
    swingState: 'idle',
    requestedShot: null,
    lastImpactTimer: null,
  }
}

export function startSwing(player: PlayerState, shot: ShotSolution): PlayerState {
  if (player.swingState !== 'idle') return player
  return {
    ...player,
    swingTimer: 1,
    swingState: 'backswing',
    requestedShot: shot,
    lastImpactTimer: null,
  }
}

export function stepPlayer(player: PlayerState): PlayerState {
  if (player.swingState === 'idle') return player

  const timer = player.swingTimer + 1
  if (timer === 20) {
    return { ...player, swingTimer: timer, swingState: 'impact', lastImpactTimer: timer }
  }
  if (timer >= 50) {
    return { ...player, swingTimer: 0, swingState: 'idle', requestedShot: null, lastImpactTimer: null }
  }
  return { ...player, swingTimer: timer, swingState: timer < 20 ? 'backswing' : 'recovery' }
}

export function consumeImpact(player: PlayerState): { player: PlayerState; shot: ShotSolution | null } {
  if (player.swingState !== 'impact' || !player.requestedShot) return { player, shot: null }
  return {
    player: { ...player, swingState: 'recovery', lastImpactTimer: null },
    shot: player.requestedShot,
  }
}

export function isBallHittableForSide(ball: BallState, side: PlayerSide): boolean {
  return (side === 1 && ball.status === 3) || (side === -1 && ball.status === 1)
}

export function createNeutralBallForSide(side: PlayerSide): BallState {
  return {
    x: side > 0 ? 0.3 : -0.3,
    y: side > 0 ? -TABLE.length / 2 + 0.06 : TABLE.length / 2 - 0.06,
    z: TABLE.height + 0.32,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    status: side > 0 ? 3 : 1,
  }
}

export function createSimpleReturnShot(ball: BallState, side: PlayerSide): ShotSolution {
  const lane = side > 0 ? -1 : 1
  const targetX = (Math.random() * 0.7 - 0.35) * TABLE.width
  const targetY = lane * (TABLE.length * (0.22 + Math.random() * 0.18))
  const spin = side > 0 ? 0.35 : -0.2 + Math.random() * 0.8
  const level = 0.72 + Math.random() * 0.18
  return solveTargetToV(ball, targetX, targetY, level, spin)
}
