// three.js scene — built once, mutated per frame. Tuned for low-end mobile:
// no shadows, capped DPR, low-poly geometry, flat/lambert materials.
import * as THREE from 'three'
import {
  TABLE_HEIGHT, TABLE_LENGTH, TABLE_WIDTH, NET_HEIGHT, BALL_R,
} from './physics'
import { GameState, SWING_TICKS } from './game'

// game coords: x width, y length (+ toward CPU is -1 side... actually you: y<0), z up
// three coords: x = game.x, y = game.z, z = -game.y  (you near camera at +z)
const gx = (x: number) => x
const gy = (z: number) => z
const gz = (y: number) => -y

export interface SceneRefs {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  ball: THREE.Mesh
  ballShadow: THREE.Mesh
  you: THREE.Group
  cpu: THREE.Group
  youPaddle: THREE.Mesh
  cpuPaddle: THREE.Mesh
  aimMarker: THREE.Mesh
  swipeArrow: THREE.Group
  swipeArrowMat: THREE.MeshBasicMaterial
}

function makeHumanoid(shirt: number, skin: number): { group: THREE.Group; paddle: THREE.Mesh } {
  const g = new THREE.Group()
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt })
  const skinMat = new THREE.MeshLambertMaterial({ color: skin })
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222831 })

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8), shirtMat)
  torso.position.y = 1.05
  g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skinMat)
  head.position.y = 1.45
  g.add(head)
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.8, 8), darkMat)
  legs.position.y = 0.4
  g.add(legs)

  // paddle arm: a simple paddle mesh we swing around
  const paddleGroup = new THREE.Group()
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.015, 12), new THREE.MeshLambertMaterial({ color: 0xb03030 }))
  blade.rotation.z = Math.PI / 2
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.02), new THREE.MeshLambertMaterial({ color: 0x8a6a4a }))
  handle.position.y = -0.12
  paddleGroup.add(blade, handle)
  const paddle = new THREE.Mesh() // proxy for typing; we return group's blade
  paddleGroup.position.set(0.25, 1.05, 0)
  g.add(paddleGroup)
  ;(g as any).__paddle = paddleGroup
  return { group: g, paddle: paddle }
}

export function buildScene(canvas: HTMLCanvasElement): SceneRefs {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'low-power', alpha: false, stencil: false, depth: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e14)
  scene.fog = new THREE.Fog(0x0a0e14, 8, 18)

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 30)

  // lights: one hemi + one directional, no shadows
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x223344, 0.9))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(2, 6, 3)
  scene.add(dir)

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 20),
    new THREE.MeshLambertMaterial({ color: 0x33261f }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  // court mat (original had a colored court area)
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 9),
    new THREE.MeshLambertMaterial({ color: 0x7a2a24 }),
  )
  court.rotation.x = -Math.PI / 2
  court.position.y = 0.005
  scene.add(court)

  // ---- table (classic csmash green-blue with white lines) ----
  const tableGroup = new THREE.Group()
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_WIDTH, 0.04, TABLE_LENGTH),
    new THREE.MeshLambertMaterial({ color: 0x1a5c38 }),
  )
  top.position.y = TABLE_HEIGHT - 0.02
  tableGroup.add(top)

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 })
  const mkLine = (w: number, l: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, TABLE_HEIGHT + 0.001, z)
    tableGroup.add(m)
  }
  const lw = 0.02
  mkLine(TABLE_WIDTH, lw, 0, TABLE_LENGTH / 2 - lw / 2)   // near end
  mkLine(TABLE_WIDTH, lw, 0, -TABLE_LENGTH / 2 + lw / 2)  // far end
  mkLine(lw, TABLE_LENGTH, TABLE_WIDTH / 2 - lw / 2, 0)
  mkLine(lw, TABLE_LENGTH, -TABLE_WIDTH / 2 + lw / 2, 0)
  mkLine(lw / 1.5, TABLE_LENGTH, 0, 0)                     // center line

  // legs
  const legMat = new THREE.MeshLambertMaterial({ color: 0x15181f })
  const legGeo = new THREE.BoxGeometry(0.05, TABLE_HEIGHT - 0.04, 0.05)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMat)
    leg.position.set(sx * (TABLE_WIDTH / 2 - 0.12), (TABLE_HEIGHT - 0.04) / 2, sz * (TABLE_LENGTH / 2 - 0.2))
    tableGroup.add(leg)
  }

  // net
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE_WIDTH + NET_HEIGHT * 2, NET_HEIGHT),
    new THREE.MeshBasicMaterial({ color: 0x1d2b3a, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
  )
  net.position.set(0, TABLE_HEIGHT + NET_HEIGHT / 2, 0)
  tableGroup.add(net)
  const netTop = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_WIDTH + NET_HEIGHT * 2, 0.012, 0.012),
    new THREE.MeshBasicMaterial({ color: 0xeeeeee }),
  )
  netTop.position.set(0, TABLE_HEIGHT + NET_HEIGHT, 0)
  tableGroup.add(netTop)
  scene.add(tableGroup)

  // ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R * 1.55, 10, 8), // slightly oversized for visibility
    new THREE.MeshBasicMaterial({ color: 0xfff3e0 }),
  )
  scene.add(ball)
  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.045, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  )
  ballShadow.rotation.x = -Math.PI / 2
  scene.add(ballShadow)

  // players — your own body is hidden (first-person, like original csmash);
  // only your paddle is visible.
  const youH = makeHumanoid(0x2255aa, 0xd9a878)
  const cpuH = makeHumanoid(0xaa3333, 0xd9a878)
  youH.group.children.forEach((c) => { if (!(c instanceof THREE.Group)) c.visible = false })
  scene.add(youH.group, cpuH.group)

  // aim marker on opponent table half
  const aimMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.085, 20),
    new THREE.MeshBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  )
  aimMarker.rotation.x = -Math.PI / 2
  aimMarker.position.y = TABLE_HEIGHT + 0.004
  aimMarker.visible = false
  scene.add(aimMarker)

  // swipe direction arrow (feedback while dragging)
  const swipeArrow = new THREE.Group()
  const swipeArrowMat = new THREE.MeshBasicMaterial({ color: 0x7ed7ff, transparent: true, opacity: 0 })
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1), swipeArrowMat)
  shaft.position.z = -0.5
  shaft.rotation.x = -Math.PI / 2
  swipeArrow.add(shaft)
  swipeArrow.visible = false
  scene.add(swipeArrow)

  return {
    renderer, scene, camera, ball, ballShadow,
    you: youH.group, cpu: cpuH.group,
    youPaddle: youH.paddle, cpuPaddle: cpuH.paddle,
    aimMarker, swipeArrow, swipeArrowMat,
  }
}

const camPos = new THREE.Vector3()
const camLook = new THREE.Vector3()

export function renderFrame(r: SceneRefs, g: GameState, alpha: number): void {
  const b = g.ball

  // ball
  const visible = b.status >= 0
  r.ball.visible = visible
  r.ballShadow.visible = visible && b.z < 3
  if (visible) {
    r.ball.position.set(gx(b.x), gy(b.z), gz(b.y))
    const overTable = Math.abs(b.x) < TABLE_WIDTH / 2 && Math.abs(b.y) < TABLE_LENGTH / 2
    r.ballShadow.position.set(gx(b.x), overTable ? TABLE_HEIGHT + 0.002 : 0.008, gz(b.y))
  }

  // players
  placePlayer(r.you, g.you.x, g.you.y, g.you.swingT, g.you.swingHand, 1)
  placePlayer(r.cpu, g.cpu.x, g.cpu.y, g.cpu.swingT, g.cpu.swingHand, -1)

  // camera: first-person-ish, at your head height slightly behind, original csmash style
  camPos.set(g.you.x * 0.8, 1.7, gz(g.you.y) + 0.9)
  camLook.set(g.you.x * 0.25, TABLE_HEIGHT - 0.12, gz(TABLE_LENGTH * 0.42))
  r.camera.position.lerp(camPos, alpha < 1 ? 0.14 : 1)
  r.camera.lookAt(camLook)

  r.renderer.render(r.scene, r.camera)
}

function placePlayer(group: THREE.Group, x: number, y: number, swingT: number, hand: number, side: number): void {
  group.position.set(gx(x), 0, gz(y))
  group.rotation.y = side > 0 ? 0 : Math.PI
  const paddle = (group as any).__paddle as THREE.Group
  if (!paddle) return
  const baseX = 0.28 * hand * (side > 0 ? 1 : 1)
  if (swingT > 0) {
    const t = swingT / SWING_TICKS
    // backswing then forward stroke arc
    const phase = t < 0.4 ? -(t / 0.4) : (t - 0.4) / 0.6 * 2 - 1
    paddle.position.set(baseX + phase * -0.18 * hand, 1.0 + Math.sin(t * Math.PI) * 0.18, phase * 0.32)
    paddle.rotation.y = phase * 0.8 * hand
  } else {
    paddle.position.set(baseX, 1.02, -0.1)
    paddle.rotation.y = 0
  }
}

export function resize(r: SceneRefs): void {
  const w = window.innerWidth, h = window.innerHeight
  r.camera.aspect = w / h
  r.camera.updateProjectionMatrix()
  r.renderer.setSize(w, h, false)
}

// Dynamic resolution: if frames are consistently slow, drop pixel ratio.
let slowFrames = 0
let currentRatio = 0
export function adaptQuality(r: SceneRefs, frameMs: number): void {
  if (currentRatio === 0) currentRatio = r.renderer.getPixelRatio()
  if (frameMs > 40) {
    if (++slowFrames > 60 && currentRatio > 0.75) {
      currentRatio = Math.max(0.75, currentRatio - 0.25)
      r.renderer.setPixelRatio(currentRatio)
      r.renderer.setSize(window.innerWidth, window.innerHeight, false)
      slowFrames = 0
    }
  } else if (slowFrames > 0) {
    slowFrames--
  }
}
