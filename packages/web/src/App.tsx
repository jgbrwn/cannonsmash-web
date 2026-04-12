import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  TABLE,
  TICK,
  applyShot,
  createIdleBall,
  findTableBounce,
  sampleTrajectory,
  solveTargetToV,
  solveTargetToVS,
  stepBall,
  tossForServe,
  type BallState,
  type ShotSolution,
} from '@csmash/core'

const BG = '#0f1115'

type Vec2 = { x: number; y: number }

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [ball, setBall] = useState<BallState>(() => createIdleBall())
  const [running, setRunning] = useState(true)
  const [target, setTarget] = useState<Vec2>({ x: 0, y: TABLE.length / 4 })
  const [spin, setSpin] = useState(0.35)
  const [level, setLevel] = useState(0.8)
  const [serveMode, setServeMode] = useState(false)
  const [lastShot, setLastShot] = useState<ShotSolution | null>(null)

  const predicted = useMemo(() => sampleTrajectory(ball, 260), [ball])
  const landing = useMemo(() => findTableBounce(predicted), [predicted])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setBall((prev) => stepBall(prev))
    }, TICK * 1000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BG)
    scene.fog = new THREE.Fog(0x0f1115, 6, 18)

    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 50)
    camera.position.set(0, -4.7, 2.8)
    camera.lookAt(0, 0.3, TABLE.height)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.1)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(3, -4, 6)
    scene.add(dir)

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshPhongMaterial({ color: 0x24303a }))
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.length, 0.06), new THREE.MeshPhongMaterial({ color: 0x1a6b58 }))
    table.position.set(0, 0, TABLE.height - 0.03)
    scene.add(table)

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff })
    const borderPts = [
      new THREE.Vector3(-TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(TABLE.width / 2, TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(-TABLE.width / 2, TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(-TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
    ]
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPts), lineMat))
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(0, TABLE.length / 2, TABLE.height + 0.002),
    ]), lineMat))

    const net = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE.width, 0.02, TABLE.netHeight),
      new THREE.MeshPhongMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.85 })
    )
    net.position.set(0, 0, TABLE.height + TABLE.netHeight / 2)
    scene.add(net)

    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(TABLE.ballRadius, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xffc62b, emissive: 0x442200 })
    )
    scene.add(ballMesh)

    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.11, 0.6, 6, 12),
      new THREE.MeshPhongMaterial({ color: 0x98c1ff })
    )
    player.position.set(0, -TABLE.length / 2 - 0.22, 1.05)
    scene.add(player)

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(TABLE.ballRadius * 1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
    )
    shadow.rotation.x = -Math.PI / 2
    scene.add(shadow)

    const trajGeom = new THREE.BufferGeometry()
    const trajLine = new THREE.Line(trajGeom, new THREE.LineBasicMaterial({ color: 0xff6b6b }))
    scene.add(trajLine)

    const targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.12, 32),
      new THREE.MeshBasicMaterial({ color: 0x7ed7ff, side: THREE.DoubleSide })
    )
    targetRing.rotation.x = -Math.PI / 2
    targetRing.position.set(target.x, target.y, TABLE.height + 0.004)
    scene.add(targetRing)

    const landingRing = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.1, 32),
      new THREE.MeshBasicMaterial({ color: 0xff6b6b, side: THREE.DoubleSide })
    )
    landingRing.rotation.x = -Math.PI / 2
    scene.add(landingRing)

    const resize = () => {
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', resize)

    let raf = 0
    const loop = () => {
      ballMesh.position.set(ball.x, ball.y, ball.z)
      shadow.position.set(ball.x, ball.y, 0.001)
      shadow.scale.setScalar(1 + Math.max(0, ball.z - TABLE.height) * 0.35)
      targetRing.position.set(target.x, target.y, TABLE.height + 0.004)

      trajGeom.setFromPoints(predicted.map((p) => new THREE.Vector3(p.x, p.y, p.z)))

      if (landing) {
        landingRing.visible = true
        landingRing.position.set(landing.x, landing.y, TABLE.height + 0.004)
      } else {
        landingRing.visible = false
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [ball, predicted, landing, target])

  const fireRally = () => {
    const base: BallState = {
      x: 0.3,
      y: -TABLE.length / 2 + 0.06,
      z: TABLE.height + 0.32,
      vx: 0,
      vy: 0,
      vz: 0,
      spin,
      status: 0,
    }
    const shot = solveTargetToV(base, target.x, target.y, level, spin)
    setLastShot(shot)
    setBall(applyShot(base, shot))
  }

  const fireServe = () => {
    const tossed = tossForServe(1)
    const shot = solveTargetToVS(tossed, target.x, target.y, level, spin)
    setLastShot(shot)
    setBall(applyShot(tossed, shot))
  }

  const resetIdle = () => {
    setBall(createIdleBall())
    setLastShot(null)
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', color: 'white' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{ position: 'absolute', top: 16, left: 16, padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12, minWidth: 280 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Cannon Smash Shot Sandbox</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>Original constants + ported target solvers.</div>
        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          <div>ball: ({ball.x.toFixed(2)}, {ball.y.toFixed(2)}, {ball.z.toFixed(2)})</div>
          <div>vel: ({ball.vx.toFixed(2)}, {ball.vy.toFixed(2)}, {ball.vz.toFixed(2)})</div>
          <div>spin: {ball.spin.toFixed(2)} | status: {ball.status}</div>
          {landing && <div>predicted bounce: ({landing.x.toFixed(2)}, {landing.y.toFixed(2)})</div>}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 16, right: 16, width: 290, padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Shot controls</div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>Target X: {target.x.toFixed(2)}</div>
        <input type="range" min={-TABLE.width / 2 + 0.06} max={TABLE.width / 2 - 0.06} step={0.01} value={target.x} onChange={(e) => setTarget((t) => ({ ...t, x: Number(e.target.value) }))} style={{ width: '100%' }} />
        <div style={{ fontSize: 12, margin: '8px 0 6px' }}>Target Y: {target.y.toFixed(2)}</div>
        <input type="range" min={0.12} max={TABLE.length / 2 - 0.08} step={0.01} value={target.y} onChange={(e) => setTarget((t) => ({ ...t, y: Number(e.target.value) }))} style={{ width: '100%' }} />
        <div style={{ fontSize: 12, margin: '8px 0 6px' }}>Spin: {spin.toFixed(2)}</div>
        <input type="range" min={-1.2} max={1.2} step={0.01} value={spin} onChange={(e) => setSpin(Number(e.target.value))} style={{ width: '100%' }} />
        <div style={{ fontSize: 12, margin: '8px 0 6px' }}>Level: {level.toFixed(2)}</div>
        <input type="range" min={0.3} max={1.0} step={0.01} value={level} onChange={(e) => setLevel(Number(e.target.value))} style={{ width: '100%' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={fireRally} style={btn}>Fire rally shot</button>
          <button onClick={fireServe} style={btnAlt}>Fire serve</button>
          <button onClick={resetIdle} style={btnGhost}>Reset</button>
          <button onClick={() => setRunning((v) => !v)} style={btnGhost}>{running ? 'Pause' : 'Resume'}</button>
        </div>
        {lastShot && (
          <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.45, opacity: 0.9 }}>
            shot: ({lastShot.vx.toFixed(2)}, {lastShot.vy.toFixed(2)}, {lastShot.vz.toFixed(2)})
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TouchPad label="Quick target pad" onChange={(v) => setTarget({ x: v.x * (TABLE.width / 2 - 0.08), y: ((v.y + 1) / 2) * (TABLE.length / 2 - 0.14) + 0.07 })} />
        <div style={{ padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
            Blue ring is desired landing target. Red ring is predicted table bounce from the current simulated shot.
            This is the first port of the original target solvers and gives us a concrete foundation for swing timing and player control next.
          </div>
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: 0, background: '#7ed7ff', color: '#00131a', fontWeight: 700 }
const btnAlt: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: 0, background: '#ffce73', color: '#281500', fontWeight: 700 }
const btnGhost: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: 'white', fontWeight: 700 }

function TouchPad({ label, onChange }: { label: string; onChange: (v: Vec2) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [local, setLocal] = useState({ x: 0, y: 0, active: false })

  const update = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((clientY - r.top) / r.height) * 2 - 1))
    const v = { x: nx, y: -ny }
    setLocal({ ...v, active: true })
    onChange(v)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => update(e.clientX, e.clientY)}
      onPointerMove={(e) => local.active && update(e.clientX, e.clientY)}
      onPointerUp={() => setLocal({ x: local.x, y: local.y, active: false })}
      onPointerCancel={() => setLocal({ x: local.x, y: local.y, active: false })}
      style={{ position: 'relative', minHeight: 140, background: 'rgba(0,0,0,0.45)', borderRadius: 12, touchAction: 'none', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: 12, left: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 110, height: 110, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: `calc(50% + ${local.x * 40}px - 14px)`, top: `calc(50% - ${local.y * 40}px - 14px)`, width: 28, height: 28, borderRadius: '50%', background: '#7ed7ff' }} />
        </div>
      </div>
    </div>
  )
}
