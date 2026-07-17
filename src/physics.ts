// Physics core — faithful port of CannonSmash Ball::Move / TargetToV / TargetToVS.
// All step functions mutate in place: zero allocations per tick.

export const TICK = 0.01
export const TABLE_LENGTH = 2.74
export const TABLE_WIDTH = 1.525
export const TABLE_HEIGHT = 0.76
export const NET_HEIGHT = 0.1525
export const BALL_R = 0.019
export const AREA_X = 8.0
export const AREA_Y = 12.0
export const AREA_Z = 6.0
export const TABLE_E = 0.8
export const PHY = 0.15

// Ball status machine (original):
//  0: +side hit, before bounce on opponent side   1: -side may hit
//  2: -side hit, before bounce                    3: +side may hit
//  4: +side serve in flight (before own bounce)   5: -side serve in flight
//  6: +side tossed, waiting serve hit             7: -side tossed
//  8: waiting for serve toss                     -1: dead
export interface Ball {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  spin: number
  status: number
  // set on death for scoring: which event killed the rally
  justBounced: boolean
  hitNet: boolean
}

export function makeBall(): Ball {
  return { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, spin: 0, status: 8, justBounced: false, hitNet: false }
}

export const gravity = (spin: number) => 9.8 + spin * 5

function safeLog(f: number): number {
  return f <= 0 ? -1e11 : Math.log(f)
}

// One fixed 10ms step. Mutates b.
export function stepBall(b: Ball): void {
  b.justBounced = false
  if (b.status < 0 || b.status === 8) return

  const px = b.x, py = b.y, pz = b.z
  b.x += (b.vx * 2 - PHY * b.vx * TICK) / 2 * TICK
  b.y += (b.vy * 2 - PHY * b.vy * TICK) / 2 * TICK
  b.z += (b.vz * 2 - gravity(b.spin) * TICK - PHY * b.vz * TICK) / 2 * TICK

  // Net crossing
  let netT = TICK * 100
  if (py * b.y <= 0.0 && b.y !== py) {
    netT = Math.abs(py / ((b.y - py) / TICK))
    const nz = pz + (b.z - pz) * netT / TICK
    const nx = px + (b.x - px) * netT / TICK
    if (nz < TABLE_HEIGHT || nz > TABLE_HEIGHT + NET_HEIGHT ||
        nx < -TABLE_WIDTH / 2 - NET_HEIGHT || nx > TABLE_WIDTH / 2 + NET_HEIGHT) {
      netT = TICK * 100
    }
  }

  // Table crossing
  let tableT = TICK * 100
  if ((pz - TABLE_HEIGHT) * (b.z - TABLE_HEIGHT) <= 0.0 && b.z !== pz) {
    tableT = Math.abs((pz - TABLE_HEIGHT) / ((b.z - pz) / TICK))
    const ty = py + (b.y - py) * tableT / TICK
    const tx = px + (b.x - px) * tableT / TICK
    if (tableT <= 0.0 || ty < -TABLE_LENGTH / 2 || ty > TABLE_LENGTH / 2 ||
        tx < -TABLE_WIDTH / 2 || tx > TABLE_WIDTH / 2) {
      tableT = TICK * 100
    }
  }

  if (netT < tableT) {
    // net cord
    b.vx *= 0.5
    b.vy = -b.vy * 0.2
    b.spin = -b.spin * 0.8
    b.y = b.vy * (TICK - netT)
    b.hitNet = true
    return
  }

  if (tableT < netT) {
    const tableY = py + b.vy * tableT
    // status transitions on bounce
    if (tableY < 0) {
      if (b.status === 2) b.status = 3
      else if (b.status === 4) b.status = 0
      else b.status = -1
    } else {
      if (b.status === 0) b.status = 1
      else if (b.status === 5) b.status = 2
      else b.status = -1
    }
    b.justBounced = true

    b.vz -= gravity(b.spin) * tableT
    b.vz += -PHY * b.vz * tableT
    b.vz *= -TABLE_E
    b.z = TABLE_HEIGHT + (TICK - tableT) * b.vz
    b.vz -= gravity(b.spin) * (TICK - tableT)
    b.vz += -PHY * b.vz * (TICK - tableT)

    b.vy += -PHY * b.vy * tableT
    if (b.vy > 0) b.vy += b.spin * 0.8
    else b.vy -= b.spin * 0.8
    b.vy += -PHY * b.vy * (TICK - tableT)
    b.vx += -PHY * b.vx * TICK
    b.spin *= 0.8
    return
  }

  // out of arena → dead
  if (b.x < -AREA_X / 2 || b.x > AREA_X / 2 || b.y < -AREA_Y / 2 || b.y > AREA_Y / 2 ||
      b.z < BALL_R || b.z > AREA_Z) {
    if (b.z < BALL_R) { b.z = BALL_R }
    b.status = -1
    return
  }

  b.vz -= gravity(b.spin) * TICK
  b.vx += -PHY * b.vx * TICK
  b.vy += -PHY * b.vy * TICK
  b.vz += -PHY * b.vz * TICK
}

export interface Shot { vx: number; vy: number; vz: number }

// Port of Ball::TargetToV — solve launch velocity so the ball lands at (targetX,targetY).
// level in (0,1]: fraction of max net-skimming speed. spin: topspin +, backspin -.
export function targetToV(
  bx: number, by: number, bz: number,
  targetX: number, targetY: number,
  level: number, spin: number,
  out: Shot,
  vMin = 0.1, vMax = 30.0,
): void {
  let y: number
  let ty = targetY
  const vyMax = Math.abs(ty - by) / Math.max(1e-6, Math.hypot(targetX - bx, ty - by)) * vMax

  if (ty < by) { y = -by; ty = -ty } else { y = by }

  const g = gravity(spin)

  if (ty * y >= 0) {
    // target on same side (serve first bounce / drop) — no net constraint
    let vy = vyMax * level * 0.5
    const t2 = -safeLog(1 - PHY * (ty - y) / vy) / PHY
    const vx = t2 !== 0 ? PHY * (targetX - bx) / (1 - Math.exp(-PHY * t2)) : 0
    const vz = t2 !== 0 ? (PHY * (TABLE_HEIGHT - bz) + g * t2) / (1 - Math.exp(-PHY * t2)) - g / PHY : 0
    if (y !== by) vy = -vy
    out.vx = vx; out.vy = vy; out.vz = vz
    return
  }

  // binary search max vy that still clears the net
  let lo = vMin, hi = vyMax, vy = vyMax, vz = 0
  for (let iter = 0; iter < 40 && hi - lo > 0.001; iter++) {
    vy = (lo + hi) / 2
    const t2 = -safeLog(1 - PHY * (ty - y) / vy) / PHY
    const t1 = -safeLog(1 - PHY * (-y) / vy) / PHY
    vz = t2 !== 0 ? (PHY * (TABLE_HEIGHT - bz) + g * t2) / (1 - Math.exp(-PHY * t2)) - g / PHY : 0
    const z1 = -(vz + g / PHY) * Math.exp(-PHY * t1) / PHY - g * t1 / PHY + (vz + g / PHY) / PHY
    if (z1 < TABLE_HEIGHT + NET_HEIGHT - bz) hi = vy
    else lo = vy
  }

  vy *= level
  const t2 = -safeLog(1 - PHY * (ty - y) / vy) / PHY
  vz = t2 !== 0 ? (PHY * (TABLE_HEIGHT - bz) + g * t2) / (1 - Math.exp(-PHY * t2)) - g / PHY : 0
  const vx = PHY * (targetX - bx) / (1 - Math.exp(-PHY * t2))
  if (y !== by) vy = -vy
  out.vx = vx; out.vy = vy; out.vz = vz
}

// Port of Ball::TargetToVS — serve solver: first bounce on own side, then clears net,
// second bounce near (targetX,targetY) on opponent side.
export function targetToVS(
  bx: number, by: number, bz: number,
  targetX: number, targetY: number,
  level: number, spin: number,
  out: Shot,
): boolean {
  let y: number
  let ty = targetY
  let bestVX = 0, bestVY = 0, bestVZ = 0
  let found = false

  if (ty < by) { y = -by; ty = -ty } else { y = by }
  const g = gravity(spin)
  const g2 = gravity(spin * 0.8)

  for (let boundY = -TABLE_LENGTH / 2 + 0.05; boundY < -0.05; boundY += 0.02) {
    let lo = 0.1, hi = 30.0
    let vy = 0, vz = 0, z = 0, t1 = 0, t2 = 0
    let vyAfter = 0, vzAfter = 0

    for (let iter = 0; iter < 40 && hi - lo > 0.001; iter++) {
      vy = (lo + hi) / 2
      t2 = -safeLog(1 - PHY * (boundY - y) / vy) / PHY
      vz = t2 !== 0 ? (PHY * (TABLE_HEIGHT - bz) + g * t2) / (1 - Math.exp(-PHY * t2)) - g / PHY : 0

      vyAfter = vy * Math.exp(-PHY * t2)
      vzAfter = (vz + g / PHY) * Math.exp(-PHY * t2) - g / PHY
      vyAfter += spin * 0.8
      vzAfter *= -TABLE_E

      t1 = -safeLog(1 - PHY * (ty - boundY) / vyAfter) / PHY
      z = -(vzAfter + g2 / PHY) * Math.exp(-PHY * t1) / PHY - g2 / PHY * t1 + (vzAfter + g2 / PHY) / PHY

      if (z > 0) hi = vy
      else lo = vy
    }

    if (Math.abs(z) < 0.01) {
      // check net clearance at y=0
      const t3 = -safeLog(1 - PHY * (-boundY) / vyAfter) / PHY
      const zn = -(vzAfter + g2 / PHY) * Math.exp(-PHY * t3) / PHY - g2 / PHY * t3 + (vzAfter + g2 / PHY) / PHY
      if (zn > NET_HEIGHT + (1.0 - level) * 0.1) {
        if (vy > bestVY) {
          bestVX = (t1 + t2) !== 0 ? PHY * (targetX - bx) / (1 - Math.exp(-PHY * (t1 + t2))) : 0
          bestVY = vy
          bestVZ = vz
          found = true
        }
      }
    }
  }

  out.vx = bestVX
  out.vy = y !== by ? -bestVY : bestVY
  out.vz = bestVZ
  return found
}

// --- prediction (scratch ball reused, no allocation) ---
const scratch: Ball = makeBall()

export function copyBall(src: Ball, dst: Ball): void {
  dst.x = src.x; dst.y = src.y; dst.z = src.z
  dst.vx = src.vx; dst.vy = src.vy; dst.vz = src.vz
  dst.spin = src.spin; dst.status = src.status
  dst.justBounced = src.justBounced; dst.hitNet = src.hitNet
}

export interface ContactPrediction {
  x: number; y: number; z: number
  ticks: number
  valid: boolean
}

// Find where a player on `side` should meet the ball: first point after the
// bounce on their side where the ball is at a comfortable striking height.
// Prefers a point near the apex after the bounce (like the original's auto-positioning).
export function predictContact(ball: Ball, side: number, out: ContactPrediction, maxTicks = 300): void {
  out.valid = false
  copyBall(ball, scratch)
  const hittable = side > 0 ? 3 : 1
  const inFlight = side > 0 ? 2 : 0 // opponent hit, not bounced yet — will become hittable
  if (scratch.status !== hittable && scratch.status !== inFlight &&
      !(side < 0 && scratch.status === 4) && !(side > 0 && scratch.status === 5)) {
    return
  }
  let best = -1
  let bestScore = -1e9
  let bx = 0, by = 0, bz = 0
  let fbTick = -1, fbX = 0, fbY = 0, fbZ = 0 // fallback: any in-band hittable point
  for (let i = 1; i <= maxTicks; i++) {
    stepBall(scratch)
    if (scratch.status < 0) break
    if (scratch.status === hittable) {
      const ay = Math.abs(scratch.y)
      const onSide = side > 0 ? scratch.y < -0.1 : scratch.y > 0.1
      const nearTable = ay <= TABLE_LENGTH / 2 + 1.9
      if (onSide && nearTable && scratch.z > TABLE_HEIGHT - 0.35 && scratch.z < TABLE_HEIGHT + 1.1) {
        if (fbTick < 0) { fbTick = i; fbX = scratch.x; fbY = scratch.y; fbZ = scratch.z }
      }
      if (onSide && nearTable && scratch.z > TABLE_HEIGHT - 0.1 && scratch.z < TABLE_HEIGHT + 0.85) {
        // score: prefer near apex height and falling slightly; prefer earlier
        const heightScore = -Math.abs(scratch.z - (TABLE_HEIGHT + 0.35))
        const riseBias = scratch.vz < 0 ? 0.08 : 0
        const score = heightScore + riseBias - i * 0.0012
        if (score > bestScore) {
          bestScore = score
          best = i
          bx = scratch.x; by = scratch.y; bz = scratch.z
        }
      }
    }
  }
  if (best > 0) {
    out.valid = true
    out.ticks = best
    out.x = bx; out.y = by; out.z = bz
  } else if (fbTick > 0) {
    out.valid = true
    out.ticks = fbTick
    out.x = fbX; out.y = fbY; out.z = fbZ
  }
}
