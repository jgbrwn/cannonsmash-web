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

export const gravity = (spin: number) => 9.8 + spin * 5

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
