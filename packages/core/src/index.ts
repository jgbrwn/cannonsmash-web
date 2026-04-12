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

export type PlayerArchetype = 'PenAttack' | 'PenDrive' | 'ShakeCut'

export interface PlayerState {
  side: PlayerSide
  archetype: PlayerArchetype
  x: number
  y: number
  z: number
  targetX: number
  targetY: number
  swingTimer: number
  swingState: SwingState
  requestedShot: ShotSolution | null
  lastImpactTimer: number | null
  status: number
  statusMax: number
}

export interface ContactMetrics {
  dx: number
  dy: number
  dz: number
  distance: number
  timingError: number
  reachable: boolean
}

export interface ContactPointPrediction {
  ball: BallState
  etaTicks: number
  playerX: number
  playerY: number
}

export interface ImpactResult {
  player: PlayerState
  shot: ShotSolution | null
  madeContact: boolean
  quality: number
  timingError: number
  distance: number
}

export interface ArchetypeProfile {
  name: PlayerArchetype
  moveSpeedX: number
  moveSpeedY: number
  reachX: number
  reachY: number
  reachZ: number
  contactRadius: number
  spinBias: number
  powerBias: number
  recoveryCost: number
  moveCost: number
  statusMax: number
}

const PLAYER_HOME_Y = TABLE.length / 2 + 0.22
const CONTACT_FORWARD = 0.22
const CONTACT_LATERAL = 0.18
const CONTACT_HEIGHT = 0.16

export const ARCHETYPES: Record<PlayerArchetype, ArchetypeProfile> = {
  PenAttack: {
    name: 'PenAttack',
    moveSpeedX: 2.8 * TICK,
    moveSpeedY: 3.35 * TICK,
    reachX: 0.29,
    reachY: 0.34,
    reachZ: 0.34,
    contactRadius: 0.39,
    spinBias: 0.08,
    powerBias: 0.09,
    recoveryCost: 0.028,
    moveCost: 0.004,
    statusMax: 1,
  },
  PenDrive: {
    name: 'PenDrive',
    moveSpeedX: 2.6 * TICK,
    moveSpeedY: 3.15 * TICK,
    reachX: 0.27,
    reachY: 0.33,
    reachZ: 0.33,
    contactRadius: 0.37,
    spinBias: 0.16,
    powerBias: 0.03,
    recoveryCost: 0.031,
    moveCost: 0.0045,
    statusMax: 1,
  },
  ShakeCut: {
    name: 'ShakeCut',
    moveSpeedX: 3.0 * TICK,
    moveSpeedY: 3.55 * TICK,
    reachX: 0.31,
    reachY: 0.36,
    reachZ: 0.36,
    contactRadius: 0.4,
    spinBias: -0.12,
    powerBias: -0.08,
    recoveryCost: 0.022,
    moveCost: 0.0035,
    statusMax: 1,
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

export function createPlayer(side: PlayerSide, archetype: PlayerArchetype = 'PenAttack'): PlayerState {
  const profile = ARCHETYPES[archetype]
  return {
    side,
    archetype,
    x: 0,
    y: side > 0 ? -PLAYER_HOME_Y : PLAYER_HOME_Y,
    z: 1.05,
    targetX: 0,
    targetY: side > 0 ? -PLAYER_HOME_Y : PLAYER_HOME_Y,
    swingTimer: 0,
    swingState: 'idle',
    requestedShot: null,
    lastImpactTimer: null,
    status: profile.statusMax,
    statusMax: profile.statusMax,
  }
}

export function setPlayerTarget(player: PlayerState, targetX: number, targetY: number): PlayerState {
  return {
    ...player,
    targetX: clamp(targetX, -TABLE.width / 2 - 0.55, TABLE.width / 2 + 0.55),
    targetY: player.side > 0
      ? clamp(targetY, -TABLE.length / 2 - 0.75, -0.08)
      : clamp(targetY, 0.08, TABLE.length / 2 + 0.75),
  }
}

export function getArchetypeProfile(player: PlayerState): ArchetypeProfile {
  return ARCHETYPES[player.archetype]
}

export function getStatusRatio(player: PlayerState): number {
  return player.statusMax > 0 ? clamp(player.status / player.statusMax, 0, 1) : 0
}

export function recoverPlayerStatus(player: PlayerState, amount = 0.0028): PlayerState {
  return {
    ...player,
    status: clamp(player.status + amount, 0, player.statusMax),
  }
}

export function startSwing(player: PlayerState, shot: ShotSolution): PlayerState {
  if (player.swingState !== 'idle') return player
  const profile = getArchetypeProfile(player)
  return {
    ...player,
    swingTimer: 1,
    swingState: 'backswing',
    requestedShot: shot,
    lastImpactTimer: null,
    status: clamp(player.status - profile.recoveryCost * 0.6, 0, player.statusMax),
  }
}

export function stepPlayer(player: PlayerState): PlayerState {
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const moveScale = 0.68 + statusRatio * 0.42
  const movedX = moveTowards(player.x, player.targetX, profile.moveSpeedX * moveScale)
  const movedY = moveTowards(player.y, player.targetY, profile.moveSpeedY * moveScale)
  const moveCost = (Math.abs(movedX - player.x) + Math.abs(movedY - player.y)) * profile.moveCost
  const moved = {
    ...player,
    x: movedX,
    y: movedY,
    status: clamp(player.status - moveCost, 0, player.statusMax),
  }

  if (moved.swingState === 'idle') return recoverPlayerStatus(moved)

  const timer = moved.swingTimer + 1
  if (timer === 20) {
    return { ...moved, swingTimer: timer, swingState: 'impact', lastImpactTimer: timer }
  }
  if (timer >= 50) {
    return recoverPlayerStatus({ ...moved, swingTimer: 0, swingState: 'idle', requestedShot: null, lastImpactTimer: null }, 0.01)
  }
  return { ...moved, swingTimer: timer, swingState: timer < 20 ? 'backswing' : 'recovery' }
}

export function getPlayerContactMetrics(player: PlayerState, ball: BallState): ContactMetrics {
  const profile = getArchetypeProfile(player)
  const rx = player.x + player.side * CONTACT_LATERAL
  const ry = player.y + player.side * CONTACT_FORWARD
  const rz = player.z + CONTACT_HEIGHT
  const dx = ball.x - rx
  const dy = ball.y - ry
  const dz = ball.z - rz
  const distance = Math.hypot(dx, dy, dz)
  const timingError = player.side * dy
  const reachable = Math.abs(dx) <= profile.reachX && Math.abs(dy) <= profile.reachY && Math.abs(dz) <= profile.reachZ && distance <= profile.contactRadius
  return { dx, dy, dz, distance, timingError, reachable }
}

function shapeShotForContact(player: PlayerState, ball: BallState, shot: ShotSolution, metrics: ContactMetrics): ShotSolution | null {
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const distancePenalty = clamp(metrics.distance / profile.contactRadius, 0, 1)
  const timingPenalty = clamp(Math.abs(metrics.timingError) / 0.28, 0, 1)
  const fatiguePenalty = 1 - statusRatio
  const quality = 1 - distancePenalty * 0.5 - timingPenalty * 0.7 - fatiguePenalty * 0.45
  if (!metrics.reachable || quality < 0.16) return null

  const errorScale = fatiguePenalty * 0.32
  const adjustedTargetX = clamp(
    shot.targetX + metrics.dx * (0.75 + errorScale) + metrics.timingError * 0.16 + profile.powerBias * 0.08,
    -TABLE.width / 2 + 0.04,
    TABLE.width / 2 - 0.04,
  )
  const adjustedTargetY = clamp(
    shot.targetY + metrics.timingError * 0.45 - Math.abs(metrics.dx) * 0.12 * Math.sign(shot.targetY || 1) + profile.powerBias * 0.16,
    shot.targetY >= 0 ? 0.08 : -TABLE.length / 2 + 0.08,
    shot.targetY >= 0 ? TABLE.length / 2 - 0.08 : -0.08,
  )
  const adjustedLevel = clamp(shot.level + profile.powerBias - timingPenalty * 0.18 - distancePenalty * 0.1 - fatiguePenalty * 0.18, 0.38, 1)
  const adjustedSpin = clamp(shot.spin + profile.spinBias - metrics.timingError * 0.9 - metrics.dx * 0.8 - fatiguePenalty * 0.15, -1.2, 1.2)

  return shot.isServe
    ? solveTargetToVS(ball, adjustedTargetX, adjustedTargetY, adjustedLevel, adjustedSpin)
    : solveTargetToV(ball, adjustedTargetX, adjustedTargetY, adjustedLevel, adjustedSpin)
}

export function resolveImpact(player: PlayerState, ball: BallState): ImpactResult {
  if (player.swingState !== 'impact' || !player.requestedShot) {
    return { player, shot: null, madeContact: false, quality: 0, timingError: 0, distance: Infinity }
  }

  const metrics = getPlayerContactMetrics(player, ball)
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const shot = shapeShotForContact(player, ball, player.requestedShot, metrics)
  const distancePenalty = clamp(metrics.distance / profile.contactRadius, 0, 1)
  const timingPenalty = clamp(Math.abs(metrics.timingError) / 0.28, 0, 1)
  const quality = clamp(1 - distancePenalty * 0.5 - timingPenalty * 0.7 - (1 - statusRatio) * 0.45, 0, 1)
  const spent = clamp(profile.recoveryCost + distancePenalty * 0.012 + timingPenalty * 0.02, 0, player.statusMax)

  return {
    player: { ...player, swingState: 'recovery', lastImpactTimer: null, status: clamp(player.status - spent, 0, player.statusMax) },
    shot,
    madeContact: Boolean(shot),
    quality,
    timingError: metrics.timingError,
    distance: metrics.distance,
  }
}

export function isBallHittableForSide(ball: BallState, side: PlayerSide): boolean {
  return (side === 1 && ball.status === 3) || (side === -1 && ball.status === 1)
}

export function predictContactPoint(ball: BallState, side: PlayerSide, maxSteps = 180): ContactPointPrediction | null {
  let cur = cloneBall(ball)
  for (let i = 0; i < maxSteps; i++) {
    if (
      ((side === 1 && cur.y <= 0) || (side === -1 && cur.y >= 0)) &&
      cur.z >= TABLE.height + 0.12 &&
      cur.z <= 1.52 &&
      cur.status >= 0
    ) {
      return {
        ball: cur,
        etaTicks: i,
        playerX: clamp(cur.x - side * CONTACT_LATERAL, -TABLE.width / 2 - 0.45, TABLE.width / 2 + 0.45),
        playerY: clamp(cur.y - side * CONTACT_FORWARD, side > 0 ? -TABLE.length / 2 - 0.72 : 0.08, side > 0 ? -0.08 : TABLE.length / 2 + 0.72),
      }
    }
    cur = stepBall(cur)
    if (cur.status < 0) break
  }
  return null
}

export function pickAIMoveTarget(player: PlayerState, ball: BallState): ContactPointPrediction | null {
  const prediction = predictContactPoint(ball, player.side)
  if (!prediction) return null
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const anticipation = 1 + (profile.moveSpeedY / (3.2 * TICK) - 1) * 0.3 + (statusRatio - 0.5) * 0.2
  return {
    ...prediction,
    playerX: clamp(prediction.playerX * anticipation, -TABLE.width / 2 - 0.5, TABLE.width / 2 + 0.5),
    playerY: prediction.playerY,
  }
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

export function createSimpleReturnShot(ball: BallState, side: PlayerSide, archetype: PlayerArchetype = 'PenAttack', statusRatio = 1): ShotSolution {
  const lane = side > 0 ? -1 : 1
  const profile = ARCHETYPES[archetype]
  const spread = 0.22 + (1 - statusRatio) * 0.12
  const targetX = (Math.random() * 0.7 - 0.35 + profile.spinBias * 0.12) * TABLE.width
  const targetY = lane * (TABLE.length * (0.22 + Math.random() * 0.18 + profile.powerBias * 0.08))
  const spin = clamp((side > 0 ? 0.35 : 0.15) + profile.spinBias + (Math.random() * 2 - 1) * spread, -1.2, 1.2)
  const level = clamp(0.72 + profile.powerBias + Math.random() * 0.18 - (1 - statusRatio) * 0.16, 0.45, 1)
  return solveTargetToV(ball, targetX, targetY, level, spin)
}
