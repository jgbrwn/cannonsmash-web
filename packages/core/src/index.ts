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

export function findTableBounces(path: BallState[], maxBounces = 2): BallState[] {
  const out: BallState[] = []
  for (let i = 1; i < path.length; i++) {
    const p = path[i]
    if (Math.abs(p.z - TABLE.height) < 0.03 && Math.abs(p.x) <= TABLE.width / 2 && Math.abs(p.y) <= TABLE.length / 2) {
      const prev = out[out.length - 1]
      if (!prev || Math.abs(prev.y - p.y) > 0.04 || Math.abs(prev.x - p.x) > 0.04) {
        out.push(p)
        if (out.length >= maxBounces) break
      }
    }
  }
  return out
}

export type PlayerSide = 1 | -1
export type SwingState = 'idle' | 'backswing' | 'impact' | 'recovery'

export type PlayerArchetype = 'PenAttack' | 'PenDrive' | 'ShakeCut'
export type HandSide = 'forehand' | 'backhand'
export type ShotFamily = 'attack' | 'drive' | 'cut' | 'block'

export interface PlannedStroke {
  shot: ShotSolution
  family: ShotFamily
  hand: HandSide
  servePattern?: ServePattern
  receivePressure?: ReceivePressure
}

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
  plannedHand: HandSide
  plannedFamily: ShotFamily
  plannedContext: StrokeContext
  plannedServePattern: ServePattern | null
  plannedReceivePressure: ReceivePressure | null
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
  contactX: number
  contactY: number
  contactZ: number
}

export interface ContactPointPrediction {
  ball: BallState
  etaTicks: number
  playerX: number
  playerY: number
}

export interface ServeAnalysis {
  isLegal: boolean
  reason: 'net' | 'own-side' | 'long' | 'wide'
  firstBounce?: BallState
  secondBounce?: BallState
}

export interface CadenceWindow {
  decisionLeadTicks: number
  impactTick: number
  contactPhase: 'early-rise' | 'peak' | 'late-fall'
}

export interface ImpactResult {
  player: PlayerState
  shot: ShotSolution | null
  madeContact: boolean
  quality: number
  timingError: number
  distance: number
}

export type StrokeContext = 'serve' | 'receive' | 'opener' | 'rally'
export type ServePattern = 'short-spin' | 'fast-long' | 'wide-setup'
export type ReceivePressure = 'low' | 'medium' | 'high'

export type RallyPattern = 'counter' | 'pressure' | 'reset'

export interface RallySequenceState {
  latest: RallyPattern | null
  dominant: RallyPattern | null
  streak: number
}

export interface AITargetChoice {
  stroke: PlannedStroke
  score: number
  targetX: number
  targetY: number
  attack: boolean
  context: StrokeContext
  thirdBallAttack: boolean
  commitStyle: 'early-take' | 'balanced' | 'late-read'
  rallyPattern: RallyPattern
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
const STANCE_OFFSET_X = 0.1
const STANCE_SWING_Y = 0.03

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
    plannedHand: 'forehand',
    plannedFamily: 'drive',
    plannedContext: 'rally',
    plannedServePattern: null,
    plannedReceivePressure: null,
    lastImpactTimer: null,
    status: profile.statusMax,
    statusMax: profile.statusMax,
  }
}

export function getPlayerStanceOffset(player: PlayerState, hand: HandSide = player.plannedHand): { x: number; y: number } {
  const stanceX = hand === 'forehand' ? STANCE_OFFSET_X : -STANCE_OFFSET_X * 0.75
  const stanceY = hand === 'forehand' ? STANCE_SWING_Y : -STANCE_SWING_Y
  return {
    x: player.side * stanceX,
    y: player.side * stanceY,
  }
}

export function setPlayerTarget(player: PlayerState, targetX: number, targetY: number, hand: HandSide = player.plannedHand): PlayerState {
  const stance = getPlayerStanceOffset(player, hand)
  const pressureScale = player.plannedReceivePressure === 'high' ? 1.18 : player.plannedReceivePressure === 'medium' ? 1.08 : 1
  return {
    ...player,
    targetX: clamp(targetX * pressureScale - stance.x, -TABLE.width / 2 - 0.55, TABLE.width / 2 + 0.55),
    targetY: player.side > 0
      ? clamp(targetY - stance.y, -TABLE.length / 2 - 0.75, -0.08)
      : clamp(targetY - stance.y, 0.08, TABLE.length / 2 + 0.75),
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

export function startSwing(
  player: PlayerState,
  shot: ShotSolution,
  family: ShotFamily = 'drive',
  hand: HandSide = 'forehand',
  servePattern: ServePattern | null = null,
  receivePressure: ReceivePressure | null = null,
  context: StrokeContext = 'rally',
): PlayerState {
  if (player.swingState !== 'idle') return player
  const profile = getArchetypeProfile(player)
  const pressureCost = receivePressure === 'high' ? 0.02 : receivePressure === 'medium' ? 0.01 : 0
  return {
    ...player,
    swingTimer: 1,
    swingState: 'backswing',
    requestedShot: shot,
    plannedFamily: family,
    plannedHand: hand,
    plannedContext: context,
    plannedServePattern: servePattern,
    plannedReceivePressure: receivePressure,
    lastImpactTimer: null,
    status: clamp(player.status - profile.recoveryCost * 0.6 - pressureCost, 0, player.statusMax),
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
    return recoverPlayerStatus({
      ...moved,
      swingTimer: 0,
      swingState: 'idle',
      requestedShot: null,
      plannedFamily: 'drive',
      plannedHand: 'forehand',
      plannedContext: 'rally',
      plannedServePattern: null,
      plannedReceivePressure: null,
      lastImpactTimer: null,
    }, 0.01)
  }
  return { ...moved, swingTimer: timer, swingState: timer < 20 ? 'backswing' : 'recovery' }
}

export function getPlayerContactMetrics(player: PlayerState, ball: BallState): ContactMetrics {
  const profile = getArchetypeProfile(player)
  const stance = getPlayerStanceOffset(player)
  const pressureReach = player.plannedReceivePressure === 'high' ? 0.88 : player.plannedReceivePressure === 'medium' ? 0.94 : 1
  const handReach = (player.plannedHand === 'forehand' ? 1 : 0.92) * pressureReach
  const rx = player.x + player.side * CONTACT_LATERAL + stance.x
  const ry = player.y + player.side * CONTACT_FORWARD + stance.y
  const rz = player.z + CONTACT_HEIGHT + (player.plannedFamily === 'attack' ? 0.03 : player.plannedFamily === 'cut' ? -0.02 : 0)
  const dx = ball.x - rx
  const dy = ball.y - ry
  const dz = ball.z - rz
  const distance = Math.hypot(dx, dy, dz)
  const timingScale = player.plannedReceivePressure === 'high' ? 1.22 : player.plannedReceivePressure === 'medium' ? 1.1 : 1
  const timingError = player.side * dy * timingScale
  const reachable = Math.abs(dx) <= profile.reachX * handReach && Math.abs(dy) <= profile.reachY * pressureReach && Math.abs(dz) <= profile.reachZ && distance <= profile.contactRadius * handReach
  return { dx, dy, dz, distance, timingError, reachable, contactX: rx, contactY: ry, contactZ: rz }
}

export function getHandSideForBall(player: PlayerState, ball: BallState): HandSide {
  const relativeX = player.side * (ball.x - player.x)
  return relativeX >= 0 ? 'forehand' : 'backhand'
}

export function classifyShotFamily(player: PlayerState, ball: BallState, hand: HandSide, statusRatio = getStatusRatio(player)): ShotFamily {
  const attackable = isAttackableBall(ball, player.side)
  if (attackable && hand === 'forehand' && statusRatio > 0.38) {
    return player.archetype === 'ShakeCut' ? 'drive' : 'attack'
  }
  if (player.archetype === 'ShakeCut') {
    return ball.z > TABLE.height + 0.26 && statusRatio > 0.45 ? 'block' : 'cut'
  }
  if (player.archetype === 'PenDrive') {
    return hand === 'forehand' ? 'drive' : 'block'
  }
  return hand === 'backhand' && statusRatio < 0.42 ? 'block' : 'drive'
}

export function buildStrokePlan(player: PlayerState, ball: BallState, targetX: number, targetY: number, level: number, spin: number, isServe = false): PlannedStroke {
  const hand = getHandSideForBall(player, ball)
  const family = classifyShotFamily(player, ball, hand)
  let nextLevel = level
  let nextSpin = spin

  if (family === 'attack') {
    nextLevel += 0.12 + Math.max(0, getArchetypeProfile(player).powerBias * 0.6)
    nextSpin += 0.08
  } else if (family === 'drive') {
    nextLevel += 0.04
    nextSpin += player.archetype === 'PenDrive' ? 0.14 : 0.06
  } else if (family === 'cut') {
    nextLevel -= 0.12
    nextSpin -= 0.24
  } else if (family === 'block') {
    nextLevel -= 0.06
    nextSpin -= 0.06
  }

  const shot = isServe
    ? solveTargetToVS(ball, targetX, targetY, clamp(nextLevel, 0.35, 1), clamp(nextSpin, -1.2, 1.2))
    : solveTargetToV(ball, targetX, targetY, clamp(nextLevel, 0.35, 1), clamp(nextSpin, -1.2, 1.2))

  return { shot, family, hand }
}

export function detectStrokeContext(player: PlayerState, ball: BallState): StrokeContext {
  if (ball.status === 6 || ball.status === 7) return 'serve'
  if (ball.status === 1 || ball.status === 3) return 'receive'
  if ((player.side === 1 && ball.status === 2) || (player.side === -1 && ball.status === 0)) return 'opener'
  return 'rally'
}

export function shouldResolveOpeningPhase(context: StrokeContext, family: ShotFamily, quality: number): boolean {
  if (context === 'opener') {
    if (family === 'attack') return quality > 0.42
    if (family === 'drive' || family === 'block') return quality > 0.6
    return false
  }
  if (context === 'receive') {
    return family === 'attack' ? quality > 0.68 : family === 'drive' || family === 'block' ? quality > 0.74 : false
  }
  return context === 'rally'
}

function inferServePattern(player: PlayerState): ServePattern {
  if (player.archetype === 'ShakeCut') return 'short-spin'
  if (player.archetype === 'PenAttack') return 'wide-setup'
  return 'fast-long'
}

function getServeWindow(context: StrokeContext, pattern?: ServePattern): { minDepth: number; maxDepth: number; maxWidth: number } {
  if (context !== 'serve') {
    return { minDepth: 0.18, maxDepth: TABLE.length / 2 - 0.08, maxWidth: TABLE.width / 2 - 0.05 }
  }
  if (pattern === 'short-spin') {
    return { minDepth: 0.13, maxDepth: 0.28, maxWidth: TABLE.width / 2 - 0.16 }
  }
  if (pattern === 'fast-long') {
    return { minDepth: 0.34, maxDepth: TABLE.length / 2 - 0.12, maxWidth: TABLE.width / 2 - 0.12 }
  }
  return { minDepth: 0.18, maxDepth: 0.36, maxWidth: TABLE.width / 2 - 0.1 }
}

function clampPlannedLanding(targetX: number, targetY: number, context: StrokeContext, pattern?: ServePattern): { x: number; y: number } {
  const lane = Math.sign(targetY || 1) || 1
  const window = getServeWindow(context, pattern)
  return {
    x: clamp(targetX, -window.maxWidth, window.maxWidth),
    y: clamp(targetY, lane * window.minDepth, lane * window.maxDepth),
  }
}

export function getDecisionLeadTicks(context: StrokeContext, archetype: PlayerArchetype, pattern?: ServePattern): number {
  return getCadenceWindow(context, archetype, 'drive', pattern).decisionLeadTicks
}

export function getSwingImpactTick(context: StrokeContext, family: ShotFamily = 'drive'): number {
  return getCadenceWindow(context, 'PenDrive', family).impactTick
}

export function getCadenceWindow(
  context: StrokeContext,
  archetype: PlayerArchetype,
  family: ShotFamily = 'drive',
  pattern?: ServePattern,
): CadenceWindow {
  if (context === 'serve') {
    return {
      decisionLeadTicks: pattern === 'fast-long' ? 8 : pattern === 'short-spin' ? 10 : 9,
      impactTick: family === 'cut' ? 17 : 16,
      contactPhase: pattern === 'short-spin' ? 'late-fall' : 'peak',
    }
  }
  if (context === 'receive') {
    return {
      decisionLeadTicks: archetype === 'ShakeCut' ? 13 : 11,
      impactTick: family === 'attack' ? 19 : 18,
      contactPhase: family === 'attack' ? 'peak' : 'early-rise',
    }
  }
  if (context === 'opener') {
    return {
      decisionLeadTicks: archetype === 'PenAttack' ? 15 : 17,
      impactTick: family === 'attack' ? 21 : 20,
      contactPhase: family === 'attack' ? 'early-rise' : 'peak',
    }
  }
  if (family === 'attack') {
    return {
      decisionLeadTicks: archetype === 'PenAttack' ? 17 : archetype === 'PenDrive' ? 18 : 19,
      impactTick: 20,
      contactPhase: 'early-rise',
    }
  }
  if (family === 'drive') {
    return {
      decisionLeadTicks: archetype === 'PenAttack' ? 18 : archetype === 'ShakeCut' ? 19 : 17,
      impactTick: 19,
      contactPhase: 'peak',
    }
  }
  if (family === 'block') {
    return {
      decisionLeadTicks: archetype === 'PenDrive' ? 16 : 17,
      impactTick: 18,
      contactPhase: 'early-rise',
    }
  }
  return {
    decisionLeadTicks: archetype === 'ShakeCut' ? 18 : 19,
    impactTick: 19,
    contactPhase: 'late-fall',
  }
}

export function getReceivePressure(pattern?: ServePattern): ReceivePressure {
  if (pattern === 'short-spin') return 'high'
  if (pattern === 'wide-setup') return 'medium'
  return 'low'
}

function chooseOpeningFamily(
  player: PlayerState,
  ball: BallState,
  hand: HandSide,
  context: StrokeContext,
  incomingServePattern?: ServePattern,
): ShotFamily {
  const statusRatio = getStatusRatio(player)
  const pressure = getReceivePressure(incomingServePattern)
  const highBall = ball.z > TABLE.height + 0.33
  const veryHighBall = ball.z > TABLE.height + 0.42

  if (context === 'receive') {
    if (incomingServePattern === 'short-spin') {
      if (player.archetype === 'ShakeCut') return highBall && statusRatio > 0.56 ? 'block' : 'cut'
      if (hand === 'backhand' || pressure === 'high') return 'block'
      return highBall && statusRatio > 0.66 && player.archetype === 'PenAttack' ? 'drive' : 'block'
    }
    if (incomingServePattern === 'fast-long') {
      if (player.archetype === 'PenAttack') return hand === 'forehand' && highBall && statusRatio > 0.5 ? 'attack' : 'drive'
      if (player.archetype === 'ShakeCut') return highBall && statusRatio > 0.58 ? 'block' : 'cut'
      return hand === 'backhand' ? 'block' : 'drive'
    }
    if (incomingServePattern === 'wide-setup') {
      if (player.archetype === 'PenAttack') return hand === 'forehand' && highBall && statusRatio > 0.54 ? 'attack' : 'drive'
      if (player.archetype === 'ShakeCut') return hand === 'backhand' || pressure === 'medium' ? 'cut' : 'block'
      return hand === 'backhand' ? 'block' : 'drive'
    }
  }

  if (context === 'opener') {
    if (player.archetype === 'PenAttack') return hand === 'forehand' && (highBall || veryHighBall) && statusRatio > 0.4 ? 'attack' : 'drive'
    if (player.archetype === 'PenDrive') return hand === 'backhand' && !highBall ? 'block' : 'drive'
    return highBall && statusRatio > 0.52 ? 'block' : 'cut'
  }

  if (context === 'serve') {
    return player.archetype === 'ShakeCut' ? 'cut' : 'drive'
  }

  return classifyShotFamily(player, ball, hand, statusRatio)
}

export function buildOpeningStrokePlan(
  player: PlayerState,
  ball: BallState,
  targetX: number,
  targetY: number,
  context: StrokeContext,
  incomingServePattern?: ServePattern,
): PlannedStroke {
  const hand = getHandSideForBall(player, ball)
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const lane = player.side > 0 ? -1 : 1
  let family: ShotFamily = chooseOpeningFamily(player, ball, hand, context, incomingServePattern)
  let level = 0.66 + profile.powerBias * 0.35
  let spin = profile.spinBias
  let depthBias = context === 'serve' ? 0.18 : context === 'receive' ? 0.24 : 0.34
  let servePattern: ServePattern | undefined
  let receivePressure: ReceivePressure | undefined

  if (context === 'serve') {
    servePattern = inferServePattern(player)
    if (servePattern === 'wide-setup') {
      family = 'drive'
      level += 0.05
      spin += 0.06
      depthBias = 0.17
      targetX = clamp(player.side * 0.5, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
    } else if (servePattern === 'fast-long') {
      family = 'drive'
      level += 0.18
      spin += 0.1
      depthBias = 0.4
      targetX = clamp(targetX * 0.2, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
    } else {
      family = 'cut'
      level -= 0.1
      spin -= 0.42
      depthBias = 0.11
      targetX = clamp(-player.side * 0.14, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
    }
  } else if (context === 'receive') {
    receivePressure = getReceivePressure(incomingServePattern)
    if (incomingServePattern === 'fast-long') {
      level += family === 'attack' ? 0.16 : family === 'drive' ? 0.06 : -0.02
      spin += family === 'attack' ? 0.02 : family === 'block' ? -0.02 : family === 'cut' ? -0.14 : 0.1
      depthBias = family === 'attack' ? 0.39 : 0.36
    } else if (incomingServePattern === 'short-spin') {
      level -= family === 'cut' ? 0.14 : family === 'block' ? 0.1 : 0.06
      spin += family === 'cut' ? -0.32 : family === 'block' ? -0.08 : 0.01
      depthBias = family === 'cut' ? 0.14 : 0.17
      targetX = clamp(targetX * 0.55, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
    } else if (incomingServePattern === 'wide-setup') {
      level += family === 'attack' ? 0.08 : family === 'drive' ? 0.01 : -0.04
      spin += family === 'cut' ? -0.18 : family === 'block' ? -0.04 : 0.06
      targetX = clamp(-targetX * 0.9, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
      depthBias = family === 'attack' ? 0.28 : 0.24
    } else if (player.archetype === 'ShakeCut') {
      level -= family === 'block' ? 0.02 : 0.08
      spin -= family === 'block' ? 0.08 : 0.22
      depthBias = 0.22
    } else if (player.archetype === 'PenAttack') {
      level += family === 'attack' ? 0.1 : 0.02
      spin += family === 'attack' ? 0.04 : 0.1
    } else {
      level += family === 'block' ? -0.01 : 0.03
      spin += family === 'block' ? -0.02 : 0.12
      targetX = clamp(targetX * 0.78, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
    }
  } else {
    if (player.archetype === 'PenAttack') {
      level += family === 'attack' ? 0.14 : 0.04
      spin += family === 'attack' ? 0.08 : 0.04
      depthBias = family === 'attack' ? 0.38 : 0.34
    } else if (player.archetype === 'PenDrive') {
      level += family === 'block' ? 0.01 : 0.08
      spin += family === 'block' ? 0.04 : 0.16
      depthBias = 0.34
    } else {
      level -= family === 'block' ? 0.01 : 0.04
      spin -= family === 'block' ? 0.12 : 0.26
      depthBias = family === 'block' ? 0.3 : 0.28
    }
  }

  const shapedTargetY = clamp(lane * TABLE.length * depthBias, lane > 0 ? 0.08 : -TABLE.length / 2 + 0.08, lane > 0 ? TABLE.length / 2 - 0.08 : -0.08)
  const clampedLanding = clampPlannedLanding(targetX, shapedTargetY, context, servePattern)
  const useServeSolver = context === 'serve'
  const rawShot = useServeSolver
    ? solveTargetToVS(ball, clampedLanding.x, clampedLanding.y, clamp(level, 0.38, 0.9), clamp(spin, -1.2, 1.2))
    : solveTargetToV(ball, clampedLanding.x, clampedLanding.y, clamp(level, 0.38, 1), clamp(spin, -1.2, 1.2))
  const shot = applyServePatternPhysics(rawShot, servePattern)
  const legalShot = context === 'serve'
    ? enforceServeWindow(shot, ball, servePattern)
    : shot

  return { shot: legalShot, family, hand, servePattern, receivePressure }
}

function applyServePatternPhysics(shot: ShotSolution, pattern?: ServePattern): ShotSolution {
  if (!pattern || !shot.isServe) return shot
  if (pattern === 'short-spin') {
    return {
      ...shot,
      targetX: clamp(shot.targetX * 0.82, -TABLE.width / 2 + 0.12, TABLE.width / 2 - 0.12),
      targetY: shot.targetY * 0.8,
      level: clamp(shot.level - 0.08, 0.35, 0.8),
      spin: clamp(shot.spin - 0.2, -1.2, 1.2),
      vx: shot.vx * 0.84,
      vy: shot.vy * 0.8,
      vz: shot.vz * 0.93,
    }
  }
  if (pattern === 'fast-long') {
    return {
      ...shot,
      targetX: clamp(shot.targetX * 0.68, -TABLE.width / 2 + 0.12, TABLE.width / 2 - 0.12),
      targetY: shot.targetY * 1.04,
      level: clamp(shot.level + 0.06, 0.45, 0.96),
      spin: clamp(shot.spin + 0.04, -1.2, 1.2),
      vx: shot.vx * 0.95,
      vy: shot.vy * 1.08,
      vz: shot.vz * 1.01,
    }
  }
  return {
    ...shot,
    targetX: clamp(shot.targetX * 1.08, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08),
    targetY: shot.targetY * 0.88,
    vx: shot.vx * 1.04,
    vy: shot.vy * 0.9,
  }
}

function enforceServeWindow(shot: ShotSolution, ball: BallState, pattern?: ServePattern): ShotSolution {
  if (!shot.isServe) return shot
  const landing = clampPlannedLanding(shot.targetX, shot.targetY, 'serve', pattern)
  return solveTargetToVS(ball, landing.x, landing.y, shot.level, shot.spin)
}

export function analyzeServe(ball: BallState, shot: ShotSolution): ServeAnalysis {
  if (!shot.isServe) return { isLegal: true, reason: 'long' }
  const path = sampleTrajectory(applyShot(ball, shot), 240)
  const bounces = findTableBounces(path, 2)
  const firstBounce = bounces[0]
  const secondBounce = bounces[1]

  if (!firstBounce) return { isLegal: false, reason: 'net' }
  const ownSide = Math.sign(firstBounce.y) === Math.sign(ball.y)
  if (!ownSide) return { isLegal: false, reason: 'net', firstBounce }
  if (Math.abs(firstBounce.x) > TABLE.width / 2 - 0.02) return { isLegal: false, reason: 'wide', firstBounce }
  if (!secondBounce) return { isLegal: false, reason: 'long', firstBounce }
  const crosses = Math.sign(secondBounce.y) !== Math.sign(ball.y)
  if (!crosses) return { isLegal: false, reason: 'own-side', firstBounce, secondBounce }
  if (Math.abs(secondBounce.x) > TABLE.width / 2 - 0.02) return { isLegal: false, reason: 'wide', firstBounce, secondBounce }
  return { isLegal: true, reason: 'long', firstBounce, secondBounce }
}

function shapeShotForContact(
  player: PlayerState,
  ball: BallState,
  shot: ShotSolution,
  metrics: ContactMetrics,
  sequence: RallySequenceState = { latest: null, dominant: null, streak: 0 },
): ShotSolution | null {
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const distancePenalty = clamp(metrics.distance / profile.contactRadius, 0, 1)
  const timingPenalty = clamp(Math.abs(metrics.timingError) / 0.28, 0, 1)
  const fatiguePenalty = 1 - statusRatio
  const lowBall = ball.z < TABLE.height + 0.22
  const openerAttackWindow = player.plannedContext === 'opener' && player.plannedFamily === 'attack'
  const pressuredReceive = player.plannedContext === 'receive' && player.plannedReceivePressure === 'high'
  const repeatedPressure = player.plannedContext === 'rally' && sequence.dominant === 'pressure' && sequence.streak >= 2
  const repeatedCounter = player.plannedContext === 'rally' && sequence.dominant === 'counter' && sequence.streak >= 2
  const repeatedReset = player.plannedContext === 'rally' && sequence.dominant === 'reset' && sequence.streak >= 2
  const attackHeightPenalty = player.plannedFamily === 'attack'
    ? lowBall ? 0.34 : ball.z < TABLE.height + 0.3 ? 0.16 : 0
    : 0
  const netClearPenalty = player.plannedFamily === 'attack' || openerAttackWindow
    ? lowBall ? 0.18 : 0.05
    : player.plannedFamily === 'drive' && ball.z < TABLE.height + 0.2
      ? 0.08
      : 0
  const bounceShapePenalty = openerAttackWindow
    ? timingPenalty * 0.12 + (fatiguePenalty * 0.08) + attackHeightPenalty * 0.5
    : repeatedPressure
      ? timingPenalty * 0.08 + fatiguePenalty * 0.06
      : 0
  const paceShape = player.plannedFamily === 'attack'
    ? openerAttackWindow ? 0.16 : repeatedPressure ? 0.08 : 0.12
    : player.plannedFamily === 'drive'
      ? player.plannedContext === 'receive' ? 0.03 : repeatedCounter ? 0.03 : repeatedReset ? -0.01 : 0.05
      : player.plannedFamily === 'cut'
        ? repeatedReset ? -0.18 : -0.15
        : repeatedCounter ? -0.06 : repeatedReset ? -0.12 : -0.09
  const spinShape = player.plannedFamily === 'attack'
    ? openerAttackWindow ? 0.02 : repeatedPressure ? 0.03 : 0.06
    : player.plannedFamily === 'drive'
      ? repeatedCounter ? 0.1 : repeatedReset ? 0.14 : 0.12
      : player.plannedFamily === 'cut'
        ? repeatedReset ? -0.32 : -0.28
        : repeatedCounter ? -0.04 : -0.08
  const netMarginShape = player.plannedFamily === 'attack'
    ? lowBall ? -0.12 : repeatedPressure ? 0 : 0.03
    : player.plannedFamily === 'drive'
      ? repeatedCounter ? 0.03 : repeatedReset ? 0.05 : 0.02
      : player.plannedFamily === 'cut'
        ? repeatedReset ? 0.08 : 0.06
        : repeatedCounter ? 0.06 : 0.08
  const sequencePenalty = repeatedPressure ? 0.08 : 0
  const sequenceBonus = repeatedCounter ? 0.05 : repeatedReset ? 0.04 : 0
  const quality = 1 - distancePenalty * 0.5 - timingPenalty * 0.7 - fatiguePenalty * 0.45 - attackHeightPenalty - netClearPenalty - bounceShapePenalty - sequencePenalty + sequenceBonus
  if (!metrics.reachable || quality < (openerAttackWindow ? 0.24 : pressuredReceive ? 0.2 : 0.16)) return null

  const familyPower = player.plannedFamily === 'attack' ? 0.12 : player.plannedFamily === 'drive' ? 0.04 : player.plannedFamily === 'cut' ? -0.12 : -0.05
  const familySpin = player.plannedFamily === 'attack' ? 0.08 : player.plannedFamily === 'drive' ? 0.1 : player.plannedFamily === 'cut' ? -0.22 : -0.04
  const handError = player.plannedHand === 'backhand' ? 0.05 : -0.01
  const errorScale = fatiguePenalty * 0.32 + (openerAttackWindow ? 0.08 : 0)
  const adjustedTargetX = clamp(
    shot.targetX + metrics.dx * (0.75 + errorScale) + metrics.timingError * (0.16 + handError) + profile.powerBias * 0.08,
    -TABLE.width / 2 + 0.04,
    TABLE.width / 2 - 0.04,
  )
  const adjustedTargetY = clamp(
    shot.targetY + metrics.timingError * 0.45 - Math.abs(metrics.dx) * 0.12 * Math.sign(shot.targetY || 1) + profile.powerBias * 0.16 + familyPower * 0.12 + paceShape * 0.08 - attackHeightPenalty * 0.16,
    shot.targetY >= 0 ? 0.08 : -TABLE.length / 2 + 0.08,
    shot.targetY >= 0 ? TABLE.length / 2 - 0.08 : -0.08,
  )
  const adjustedLevel = clamp(shot.level + profile.powerBias + familyPower + paceShape - timingPenalty * 0.18 - distancePenalty * 0.1 - fatiguePenalty * 0.18 - attackHeightPenalty * 0.22 - netClearPenalty * 0.12, 0.32, 1)
  const adjustedSpin = clamp(shot.spin + profile.spinBias + familySpin + spinShape - metrics.timingError * 0.9 - metrics.dx * 0.8 - fatiguePenalty * 0.15 - bounceShapePenalty * 0.2, -1.2, 1.2)

  const solved = shot.isServe
    ? solveTargetToVS(ball, adjustedTargetX, adjustedTargetY, adjustedLevel, adjustedSpin)
    : solveTargetToV(ball, adjustedTargetX, adjustedTargetY, adjustedLevel, adjustedSpin)

  if (shot.isServe) return solved

  return {
    ...solved,
    vz: solved.vz + netMarginShape,
    vy: solved.vy * (1 + paceShape * 0.08),
    spin: clamp(solved.spin + spinShape * 0.4, -1.2, 1.2),
  }
}

export function resolveImpact(
  player: PlayerState,
  ball: BallState,
  sequence: RallySequenceState = { latest: null, dominant: null, streak: 0 },
): ImpactResult {
  if (player.swingState !== 'impact' || !player.requestedShot) {
    return { player, shot: null, madeContact: false, quality: 0, timingError: 0, distance: Infinity }
  }

  const metrics = getPlayerContactMetrics(player, ball)
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const repeatedPressure = player.plannedContext === 'rally' && sequence.dominant === 'pressure' && sequence.streak >= 2
  const repeatedCounter = player.plannedContext === 'rally' && sequence.dominant === 'counter' && sequence.streak >= 2
  const repeatedReset = player.plannedContext === 'rally' && sequence.dominant === 'reset' && sequence.streak >= 2
  const shot = shapeShotForContact(player, ball, player.requestedShot, metrics, sequence)
  const distancePenalty = clamp(metrics.distance / profile.contactRadius, 0, 1)
  const timingPenalty = clamp(Math.abs(metrics.timingError) / 0.28, 0, 1)
  const quality = clamp(1 - distancePenalty * 0.5 - timingPenalty * 0.7 - (1 - statusRatio) * 0.45, 0, 1)
  const pressurePenalty = player.plannedReceivePressure === 'high' ? 0.08 : player.plannedReceivePressure === 'medium' ? 0.04 : 0
  const firstAttackPenalty = player.plannedContext === 'opener' && player.plannedFamily === 'attack' && ball.z < TABLE.height + 0.3 ? 0.035 : 0
  const sequenceSpend = repeatedPressure ? 0.02 : repeatedCounter ? -0.006 : repeatedReset ? -0.01 : 0
  const spent = clamp(profile.recoveryCost + distancePenalty * 0.012 + timingPenalty * 0.02 + pressurePenalty * 0.4 + firstAttackPenalty + sequenceSpend, 0, player.statusMax)

  return {
    player: {
      ...player,
      swingState: 'recovery',
      lastImpactTimer: null,
      status: clamp(player.status - spent + (repeatedReset && shot ? 0.006 : repeatedCounter && shot ? 0.003 : 0), 0, player.statusMax),
      plannedReceivePressure: null,
    },
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

export function predictContactPoint(ball: BallState, side: PlayerSide, maxSteps = 180, hand: HandSide = 'forehand'): ContactPointPrediction | null {
  let cur = cloneBall(ball)
  const dummyPlayer = createPlayer(side)
  dummyPlayer.plannedHand = hand
  for (let i = 0; i < maxSteps; i++) {
    if (
      ((side === 1 && cur.y <= 0) || (side === -1 && cur.y >= 0)) &&
      cur.z >= TABLE.height + 0.12 &&
      cur.z <= 1.52 &&
      cur.status >= 0
    ) {
      const stance = getPlayerStanceOffset(dummyPlayer, hand)
      return {
        ball: cur,
        etaTicks: i,
        playerX: clamp(cur.x - side * CONTACT_LATERAL - stance.x, -TABLE.width / 2 - 0.45, TABLE.width / 2 + 0.45),
        playerY: clamp(cur.y - side * CONTACT_FORWARD - stance.y, side > 0 ? -TABLE.length / 2 - 0.72 : 0.08, side > 0 ? -0.08 : TABLE.length / 2 + 0.72),
      }
    }
    cur = stepBall(cur)
    if (cur.status < 0) break
  }
  return null
}

export function pickAIMoveTarget(player: PlayerState, ball: BallState): ContactPointPrediction | null {
  const hand = getHandSideForBall(player, ball)
  const prediction = predictContactPoint(ball, player.side, 180, hand)
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

export function findContactPointForPhase(
  ball: BallState,
  side: PlayerSide,
  phase: CadenceWindow['contactPhase'],
  maxSteps = 180,
  hand: HandSide = 'forehand',
): ContactPointPrediction | null {
  const matches: ContactPointPrediction[] = []
  let cur = cloneBall(ball)
  const dummyPlayer = createPlayer(side)
  dummyPlayer.plannedHand = hand

  for (let i = 0; i < maxSteps; i++) {
    if (
      ((side === 1 && cur.y <= 0) || (side === -1 && cur.y >= 0)) &&
      cur.z >= TABLE.height + 0.12 &&
      cur.z <= 1.52 &&
      cur.status >= 0
    ) {
      const stance = getPlayerStanceOffset(dummyPlayer, hand)
      matches.push({
        ball: cur,
        etaTicks: i,
        playerX: clamp(cur.x - side * CONTACT_LATERAL - stance.x, -TABLE.width / 2 - 0.45, TABLE.width / 2 + 0.45),
        playerY: clamp(cur.y - side * CONTACT_FORWARD - stance.y, side > 0 ? -TABLE.length / 2 - 0.72 : 0.08, side > 0 ? -0.08 : TABLE.length / 2 + 0.72),
      })
    }
    cur = stepBall(cur)
    if (cur.status < 0) break
  }

  if (!matches.length) return null
  if (phase === 'early-rise') return matches[0]
  if (phase === 'late-fall') return matches[Math.max(0, matches.length - 1)]
  return matches[Math.floor(matches.length / 2)]
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

function isAttackableBall(ball: BallState, side: PlayerSide): boolean {
  return ball.z > TABLE.height + 0.34 && ((side === 1 && ball.y < -0.2) || (side === -1 && ball.y > 0.2))
}

export function chooseRallyFamily(player: PlayerState, ball: BallState, hand: HandSide, incomingPattern: RallyPattern | null = null): ShotFamily {
  const statusRatio = getStatusRatio(player)
  const highBall = ball.z > TABLE.height + 0.36
  const lowBall = ball.z < TABLE.height + 0.2
  const closeToTable = Math.abs(ball.y) < TABLE.length * 0.19
  const tired = statusRatio < 0.34
  const pressuredButFresh = statusRatio > 0.62

  if (incomingPattern === 'pressure') {
    if (player.archetype === 'ShakeCut') return lowBall || hand === 'backhand' || tired ? 'cut' : 'block'
    if (player.archetype === 'PenDrive') return hand === 'backhand' || closeToTable || tired ? 'block' : highBall && hand === 'forehand' && pressuredButFresh ? 'attack' : 'drive'
    if (hand === 'backhand' || closeToTable || tired) return 'block'
    return highBall && hand === 'forehand' && statusRatio > 0.56 ? 'attack' : 'drive'
  }

  if (incomingPattern === 'reset') {
    if (player.archetype === 'ShakeCut') return highBall && hand === 'forehand' && statusRatio > 0.68 ? 'drive' : 'cut'
    if (player.archetype === 'PenDrive') return tired ? 'drive' : hand === 'forehand' && statusRatio > 0.42 ? (highBall ? 'attack' : 'drive') : 'drive'
    return tired ? 'drive' : hand === 'forehand' && statusRatio > 0.36 ? (highBall ? 'attack' : 'drive') : 'block'
  }

  if (incomingPattern === 'counter') {
    if (player.archetype === 'ShakeCut') return hand === 'backhand' || lowBall ? 'block' : tired ? 'cut' : 'cut'
    if (player.archetype === 'PenDrive') return hand === 'backhand' || closeToTable || tired ? 'block' : 'drive'
    if (hand === 'forehand' && highBall && statusRatio > 0.46) return 'attack'
    return hand === 'forehand' && !tired ? 'drive' : 'block'
  }

  if (player.archetype === 'PenAttack') {
    if (hand === 'forehand' && highBall && statusRatio > 0.34) return 'attack'
    if (hand === 'backhand' && closeToTable) return statusRatio > 0.46 ? 'block' : 'drive'
    return hand === 'forehand' ? 'drive' : 'block'
  }

  if (player.archetype === 'PenDrive') {
    if (hand === 'forehand' && highBall && statusRatio > 0.5) return 'attack'
    if (hand === 'backhand' || closeToTable) return 'block'
    return lowBall ? 'block' : 'drive'
  }

  if (highBall && hand === 'forehand' && statusRatio > 0.62) return 'drive'
  if (closeToTable || hand === 'backhand') return 'block'
  return lowBall ? 'cut' : 'block'
}

export function getRallyCommitStyle(
  archetype: PlayerArchetype,
  family: ShotFamily,
  hand: HandSide,
  ball: BallState,
): 'early-take' | 'balanced' | 'late-read' {
  const highBall = ball.z > TABLE.height + 0.36
  const closeToTable = Math.abs(ball.y) < TABLE.length * 0.19
  if (family === 'attack') return archetype === 'PenAttack' || highBall ? 'early-take' : 'balanced'
  if (family === 'block') return closeToTable || archetype === 'PenDrive' ? 'early-take' : 'balanced'
  if (family === 'cut') return 'late-read'
  if (archetype === 'ShakeCut') return 'late-read'
  if (hand === 'backhand' && closeToTable) return 'early-take'
  return 'balanced'
}

export function inferRallyPatternFromShot(shot: ShotSolution | null, sourceBall?: BallState): RallyPattern | null {
  if (!shot) return null
  const widthPressure = Math.abs(shot.targetX) / (TABLE.width / 2)
  const depthPressure = Math.abs(shot.targetY) / (TABLE.length / 2)
  const pace = shot.level
  const topspin = shot.spin > 0.16
  const underspin = shot.spin < -0.18

  let bounceDepth = depthPressure
  let bounceWidth = widthPressure
  let postBouncePace = pace
  let netClear = 0.12

  if (sourceBall) {
    const path = sampleTrajectory(applyShot(sourceBall, shot), 220)
    const bounce = findTableBounce(path)
    if (bounce) {
      bounceDepth = Math.abs(bounce.y) / (TABLE.length / 2)
      bounceWidth = Math.abs(bounce.x) / (TABLE.width / 2)
      postBouncePace = Math.min(1, Math.hypot(bounce.vx, bounce.vy) / 11.5)
    }
    const netSample = path.find((p) => Math.abs(p.y) < 0.03)
    if (netSample) netClear = netSample.z - TABLE.height - TABLE.netHeight
  }

  if (
    postBouncePace > 0.74 ||
    (bounceDepth > 0.7 && bounceWidth > 0.28 && topspin) ||
    (pace > 0.82 && netClear < 0.14)
  ) return 'pressure'

  if (
    underspin ||
    (postBouncePace < 0.5 && bounceDepth < 0.54) ||
    netClear > 0.22
  ) return 'reset'

  return 'counter'
}

export function getNextRallySequenceState(
  current: RallySequenceState,
  next: RallyPattern | null,
): RallySequenceState {
  if (!next) return { latest: null, dominant: current.dominant, streak: 0 }
  const streak = current.latest === next ? current.streak + 1 : 1
  const dominant = streak >= 2 ? next : current.dominant ?? next
  return { latest: next, dominant, streak }
}

export function chooseRallyPattern(
  player: PlayerState,
  family: ShotFamily,
  ball: BallState,
  incomingPattern: RallyPattern | null,
  sequence: RallySequenceState = { latest: null, dominant: null, streak: 0 },
): RallyPattern {
  const statusRatio = getStatusRatio(player)
  const highBall = ball.z > TABLE.height + 0.36
  const closeToTable = Math.abs(ball.y) < TABLE.length * 0.19
  const tired = statusRatio < 0.34
  const repeatedPressure = sequence.dominant === 'pressure' && sequence.streak >= 2
  const repeatedCounter = sequence.dominant === 'counter' && sequence.streak >= 2
  const repeatedReset = sequence.dominant === 'reset' && sequence.streak >= 2

  if (incomingPattern === 'pressure') {
    if (repeatedPressure) {
      if (family === 'cut') return 'reset'
      if (family === 'block' || family === 'drive') return tired ? 'reset' : 'counter'
      return highBall && statusRatio > 0.7 ? 'pressure' : 'counter'
    }
    if (family === 'block') return tired ? 'reset' : 'counter'
    if (family === 'cut') return 'reset'
    if (family === 'drive') return player.archetype === 'PenAttack' && statusRatio > 0.64 && highBall ? 'pressure' : tired ? 'reset' : 'counter'
    return highBall && statusRatio > 0.6 ? 'pressure' : 'counter'
  }

  if (incomingPattern === 'reset') {
    if (repeatedReset) {
      if (family === 'attack') return highBall && statusRatio > 0.34 ? 'pressure' : 'counter'
      if (family === 'drive') return player.archetype === 'ShakeCut' || tired ? 'reset' : 'pressure'
      return family === 'cut' ? 'reset' : 'counter'
    }
    if (family === 'attack') return highBall && statusRatio > 0.38 ? 'pressure' : 'counter'
    if (family === 'drive') return player.archetype === 'ShakeCut' || tired ? 'reset' : statusRatio > 0.34 ? 'pressure' : 'counter'
    return family === 'cut' ? 'reset' : 'counter'
  }

  if (incomingPattern === 'counter') {
    if (repeatedCounter) {
      if (family === 'drive') return tired ? 'reset' : 'counter'
      if (family === 'block') return 'counter'
      if (family === 'attack') return highBall && statusRatio > 0.62 ? 'pressure' : 'counter'
      return statusRatio > 0.58 ? 'counter' : 'reset'
    }
    if (family === 'drive') return player.archetype === 'ShakeCut' ? 'counter' : closeToTable || tired ? 'counter' : 'pressure'
    if (family === 'attack') return highBall && statusRatio > 0.5 ? 'pressure' : 'counter'
    if (family === 'block') return 'counter'
    return statusRatio > 0.5 ? 'counter' : 'reset'
  }

  if (family === 'attack') return highBall && statusRatio > 0.48 ? 'pressure' : 'counter'
  if (family === 'block') return closeToTable && !tired ? 'counter' : 'reset'
  if (family === 'cut') return statusRatio > 0.45 ? 'reset' : 'counter'
  if (player.archetype === 'PenAttack' && statusRatio > 0.52) return 'pressure'
  if (player.archetype === 'ShakeCut') return 'reset'
  return closeToTable || tired ? 'counter' : 'pressure'
}

export function buildRallyStrokePlan(
  player: PlayerState,
  ball: BallState,
  targetX: number,
  targetY: number,
  incomingPattern: RallyPattern | null = null,
  sequence: RallySequenceState = { latest: null, dominant: null, streak: 0 },
): PlannedStroke & { rallyPattern: RallyPattern; commitStyle: 'early-take' | 'balanced' | 'late-read' } {
  const hand = getHandSideForBall(player, ball)
  const family = chooseRallyFamily(player, ball, hand, incomingPattern)
  const rallyPattern = chooseRallyPattern(player, family, ball, incomingPattern, sequence)
  const commitStyle = getRallyCommitStyle(player.archetype, family, hand, ball)
  const profile = getArchetypeProfile(player)
  const lane = player.side > 0 ? -1 : 1
  const highBall = ball.z > TABLE.height + 0.36
  let nextTargetX = targetX
  let nextTargetY = targetY
  let level = 0.68 + profile.powerBias * 0.45
  let spin = profile.spinBias

  if (family === 'attack') {
    level += rallyPattern === 'pressure' ? 0.2 : 0.14
    spin += rallyPattern === 'pressure' ? 0.12 : 0.06
    nextTargetY = lane * TABLE.length * (rallyPattern === 'pressure' ? (highBall ? 0.43 : 0.39) : 0.35)
    nextTargetX = clamp(targetX * (rallyPattern === 'pressure' ? 1.18 : 1.04) + player.side * 0.06, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  } else if (family === 'drive') {
    level += rallyPattern === 'pressure' ? 0.1 : rallyPattern === 'reset' ? 0.02 : 0.06
    spin += rallyPattern === 'reset' ? 0.1 : player.archetype === 'ShakeCut' ? 0.02 : 0.16
    nextTargetY = lane * TABLE.length * (rallyPattern === 'reset' ? 0.29 : rallyPattern === 'pressure' ? 0.37 : 0.33)
    nextTargetX = clamp(targetX * (rallyPattern === 'counter' ? 0.96 : 0.82), -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  } else if (family === 'block') {
    level += rallyPattern === 'counter' ? 0 : -0.05
    spin += rallyPattern === 'reset' ? -0.08 : player.archetype === 'ShakeCut' ? -0.08 : -0.02
    nextTargetY = lane * TABLE.length * (rallyPattern === 'reset' ? 0.22 : 0.27)
    nextTargetX = clamp(-targetX * (rallyPattern === 'counter' ? 0.82 : 0.62) + (hand === 'backhand' ? -player.side * 0.04 : player.side * 0.04), -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  } else {
    level -= rallyPattern === 'reset' ? 0.14 : 0.09
    spin -= rallyPattern === 'counter' ? 0.2 : 0.3
    nextTargetY = lane * TABLE.length * (rallyPattern === 'counter' ? 0.25 : 0.21)
    nextTargetX = clamp(-targetX * (rallyPattern === 'counter' ? 0.66 : 0.5) - player.side * 0.05, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  }

  const shot = solveTargetToV(ball, nextTargetX, nextTargetY, clamp(level, 0.38, 1), clamp(spin, -1.2, 1.2))
  return { shot, family, hand, rallyPattern, commitStyle }
}

function applyRallyFamilyPlan(
  player: PlayerState,
  ball: BallState,
  hand: HandSide,
  family: ShotFamily,
  rallyPattern: 'counter' | 'pressure' | 'reset',
  targetX: number,
  targetY: number,
): PlannedStroke {
  const profile = getArchetypeProfile(player)
  const lane = player.side > 0 ? -1 : 1
  const highBall = ball.z > TABLE.height + 0.36
  let nextTargetX = targetX
  let nextTargetY = targetY
  let level = 0.68 + profile.powerBias * 0.45
  let spin = profile.spinBias

  if (family === 'attack') {
    level += rallyPattern === 'pressure' ? 0.2 : 0.14
    spin += rallyPattern === 'pressure' ? 0.12 : 0.06
    nextTargetY = lane * TABLE.length * (rallyPattern === 'pressure' ? (highBall ? 0.43 : 0.39) : 0.35)
    nextTargetX = clamp(targetX * (rallyPattern === 'pressure' ? 1.18 : 1.04) + player.side * 0.06, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  } else if (family === 'drive') {
    level += rallyPattern === 'pressure' ? 0.1 : rallyPattern === 'reset' ? 0.02 : 0.06
    spin += rallyPattern === 'reset' ? 0.1 : player.archetype === 'ShakeCut' ? 0.02 : 0.16
    nextTargetY = lane * TABLE.length * (rallyPattern === 'reset' ? 0.29 : rallyPattern === 'pressure' ? 0.37 : 0.33)
    nextTargetX = clamp(targetX * (rallyPattern === 'counter' ? 0.96 : 0.82), -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  } else if (family === 'block') {
    level += rallyPattern === 'counter' ? 0 : -0.05
    spin += rallyPattern === 'reset' ? -0.08 : player.archetype === 'ShakeCut' ? -0.08 : -0.02
    nextTargetY = lane * TABLE.length * (rallyPattern === 'reset' ? 0.22 : 0.27)
    nextTargetX = clamp(-targetX * (rallyPattern === 'counter' ? 0.82 : 0.62) + (hand === 'backhand' ? -player.side * 0.04 : player.side * 0.04), -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  } else {
    level -= rallyPattern === 'reset' ? 0.14 : 0.09
    spin -= rallyPattern === 'counter' ? 0.2 : 0.3
    nextTargetY = lane * TABLE.length * (rallyPattern === 'counter' ? 0.25 : 0.21)
    nextTargetX = clamp(-targetX * (rallyPattern === 'counter' ? 0.66 : 0.5) - player.side * 0.05, -TABLE.width / 2 + 0.08, TABLE.width / 2 - 0.08)
  }

  const shot = solveTargetToV(ball, nextTargetX, nextTargetY, clamp(level, 0.38, 1), clamp(spin, -1.2, 1.2))
  return { shot, family, hand }
}

function evaluateAIReturn(player: PlayerState, stroke: PlannedStroke, attack: boolean, context: StrokeContext, thirdBallAttack: boolean): number {
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const shot = stroke.shot
  const widthPressure = Math.abs(shot.targetX) / (TABLE.width / 2)
  const depthPressure = Math.abs(shot.targetY) / (TABLE.length / 2)
  const pace = shot.level
  const spinValue = Math.abs(shot.spin)
  let score = widthPressure * 0.55 + depthPressure * 0.45 + pace * 0.5 + spinValue * 0.16
  if (attack) score += 0.22 + profile.powerBias * 0.6
  else score += profile.spinBias > 0 ? 0.04 : 0.08
  if (stroke.family === 'attack') score += 0.16
  if (stroke.family === 'cut') score += player.archetype === 'ShakeCut' ? 0.18 : -0.08
  if (stroke.hand === 'backhand') score -= player.archetype === 'PenDrive' ? 0.12 : 0.05
  if (context === 'serve') score += stroke.family === 'cut' ? 0.12 : 0.04
  if (context === 'receive') score += stroke.family === 'block' || stroke.family === 'cut' ? 0.12 : 0
  if (context === 'opener') score += stroke.family === 'attack' ? 0.14 : 0.05
  if (stroke.servePattern === 'short-spin') score += 0.12
  if (stroke.servePattern === 'wide-setup') score += thirdBallAttack ? 0.16 : 0.08
  if (stroke.servePattern === 'fast-long') score += thirdBallAttack ? 0.12 : 0.04
  if (thirdBallAttack && context === 'serve') score += 0.18
  if (thirdBallAttack && context === 'opener') score += 0.12
  score += statusRatio * 0.18
  score -= (1 - statusRatio) * (attack ? 0.26 : 0.08)
  return score
}

export function chooseAIReturnShot(
  player: PlayerState,
  ball: BallState,
  incomingServePattern?: ServePattern,
  incomingRallyPattern: RallyPattern | null = null,
  sequence: RallySequenceState = { latest: null, dominant: null, streak: 0 },
): AITargetChoice {
  const side = player.side
  const lane = side > 0 ? -1 : 1
  const profile = getArchetypeProfile(player)
  const statusRatio = getStatusRatio(player)
  const context = detectStrokeContext(player, ball)
  const attack = (context === 'opener' || context === 'rally') && isAttackableBall(ball, side) && statusRatio > 0.28
  const thirdBallAttack = (context === 'serve' && player.archetype !== 'ShakeCut') || (context === 'opener' && player.archetype === 'PenAttack')

  if (context !== 'rally') {
    const openerX = context === 'serve'
      ? player.archetype === 'PenAttack'
        ? clamp(side * 0.42, -TABLE.width / 2 + 0.12, TABLE.width / 2 - 0.12)
        : player.archetype === 'PenDrive'
          ? 0
          : clamp(-side * 0.12, -TABLE.width / 2 + 0.12, TABLE.width / 2 - 0.12)
      : player.archetype === 'PenAttack'
        ? side * 0.18
        : player.archetype === 'PenDrive'
          ? 0
          : -side * 0.12
    const openerY = lane * TABLE.length * (context === 'serve' ? 0.18 : context === 'receive' ? 0.24 : 0.34)
    const stroke = buildOpeningStrokePlan(player, ball, openerX, openerY, context, incomingServePattern)
    return {
      stroke,
      score: evaluateAIReturn(player, stroke, attack, context, thirdBallAttack),
      targetX: openerX,
      targetY: openerY,
      attack,
      context,
      thirdBallAttack,
      commitStyle: stroke.family === 'attack' ? 'early-take' : stroke.family === 'cut' ? 'late-read' : 'balanced',
      rallyPattern: 'counter',
    }
  }

  let best: AITargetChoice | null = null
  const hand = getHandSideForBall(player, ball)
  const family = chooseRallyFamily(player, ball, hand, incomingRallyPattern)
  const commitStyle = getRallyCommitStyle(player.archetype, family, hand, ball)
  const rallyPattern = chooseRallyPattern(player, family, ball, incomingRallyPattern, sequence)
  const xs = family === 'attack'
    ? [-0.44, -0.24, 0.24, 0.44].map((f) => f * (TABLE.width / 2))
    : family === 'block'
      ? [-0.32, -0.14, 0.14, 0.32].map((f) => f * (TABLE.width / 2))
      : family === 'cut'
        ? [-0.28, 0, 0.28].map((f) => f * (TABLE.width / 2))
        : [-0.38, -0.18, 0, 0.18, 0.38].map((f) => f * (TABLE.width / 2))
  const ys = family === 'attack'
    ? [0.34, 0.4, 0.45].map((f) => lane * TABLE.length * f)
    : family === 'block'
      ? [0.2, 0.24, 0.29].map((f) => lane * TABLE.length * f)
      : family === 'cut'
        ? [0.18, 0.22, 0.26].map((f) => lane * TABLE.length * f)
        : [0.26, 0.32, 0.37].map((f) => lane * TABLE.length * f)

  for (const targetX of xs) {
    for (const targetY of ys) {
      const stroke = applyRallyFamilyPlan(player, ball, hand, family, rallyPattern, targetX, targetY)
      const path = sampleTrajectory(applyShot(ball, stroke.shot), 200)
      const bounce = findTableBounce(path)
      if (!bounce) continue
      const sameSide = side > 0 ? bounce.y < 0 : bounce.y > 0
      if (sameSide) continue
      let score = evaluateAIReturn(player, stroke, attack, context, thirdBallAttack)
      if (family === 'attack') score += Math.abs(targetX) / (TABLE.width / 2) * 0.08 + Math.abs(targetY) / (TABLE.length / 2) * 0.06
      if (family === 'drive') score += Math.abs(targetX) / (TABLE.width / 2) * 0.04 + 0.05
      if (family === 'block') score += (1 - Math.abs(targetY) / (TABLE.length / 2)) * 0.08
      if (family === 'cut') score += (1 - Math.abs(targetY) / (TABLE.length / 2)) * 0.1 + (player.archetype === 'ShakeCut' ? 0.08 : 0)
      if (rallyPattern === 'pressure') score += family === 'attack' || family === 'drive' ? 0.12 : -0.04
      if (rallyPattern === 'counter') score += family === 'block' || family === 'drive' ? 0.08 : 0.02
      if (rallyPattern === 'reset') score += family === 'cut' || family === 'block' ? 0.1 : -0.03
      if (statusRatio < 0.34 && rallyPattern === 'pressure') score -= 0.12
      if (statusRatio < 0.34 && (family === 'cut' || family === 'block') && rallyPattern === 'reset') score += 0.08
      if (statusRatio > 0.68 && incomingRallyPattern === 'reset' && rallyPattern === 'pressure') score += 0.05
      if (!best || score > best.score) best = { stroke, score, targetX, targetY, attack: family === 'attack', context, thirdBallAttack, commitStyle, rallyPattern }
    }
  }

  if (best) return best
  const fallback = applyRallyFamilyPlan(player, ball, hand, family, rallyPattern, 0, lane * TABLE.length * 0.28)
  return { stroke: fallback, score: -1, targetX: 0, targetY: lane * TABLE.length * 0.28, attack: family === 'attack', context, thirdBallAttack, commitStyle, rallyPattern }
}
