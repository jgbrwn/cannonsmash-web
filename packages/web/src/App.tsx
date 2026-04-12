import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { TABLE, createDemoBall, sampleTrajectory, stepBall, TICK, type BallState } from '@csmash/core'

const BG = '#0f1115'

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [ball, setBall] = useState<BallState>(() => createDemoBall())
  const [running, setRunning] = useState(true)
  const [drag, setDrag] = useState({ x: 0, y: 0 })

  const predicted = useMemo(() => sampleTrajectory(ball, 240), [ball])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setBall((prev) => {
        const next = stepBall(prev)
        if (next.status < 0) {
          const reset = createDemoBall()
          reset.vx += drag.x * 0.6
          reset.spin += drag.y * 0.8
          return reset
        }
        return next
      })
    }, TICK * 1000)
    return () => clearInterval(id)
  }, [running, drag])

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

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshPhongMaterial({ color: 0x24303a })
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE.width, TABLE.length, 0.06),
      new THREE.MeshPhongMaterial({ color: 0x1a6b58 })
    )
    table.position.set(0, 0, TABLE.height - 0.03)
    scene.add(table)

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff })
    const linePts = [
      new THREE.Vector3(-TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(TABLE.width / 2, TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(-TABLE.width / 2, TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(-TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
    ]
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), lineMat))

    const centerLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -TABLE.length / 2, TABLE.height + 0.002),
        new THREE.Vector3(0, TABLE.length / 2, TABLE.height + 0.002),
      ]),
      lineMat
    )
    scene.add(centerLine)

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

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(TABLE.ballRadius * 1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
    )
    shadow.rotation.x = -Math.PI / 2
    scene.add(shadow)

    const trajGeom = new THREE.BufferGeometry()
    const trajMat = new THREE.LineBasicMaterial({ color: 0xff6b6b })
    const trajLine = new THREE.Line(trajGeom, trajMat)
    scene.add(trajLine)

    const target = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.12, 32),
      new THREE.MeshBasicMaterial({ color: 0x7ed7ff, side: THREE.DoubleSide })
    )
    target.rotation.x = -Math.PI / 2
    target.position.set(0, TABLE.length * 0.25, TABLE.height + 0.004)
    scene.add(target)

    const resize = () => {
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', resize)

    const render = () => {
      ballMesh.position.set(ball.x, ball.y, ball.z)
      shadow.position.set(ball.x, ball.y, 0.001)
      shadow.scale.setScalar(1 + Math.max(0, ball.z - TABLE.height) * 0.35)

      const pts = predicted.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      trajGeom.setFromPoints(pts)

      const landing = predicted.find((p, i) => i > 0 && Math.abs(p.z - TABLE.height) < 0.03 && Math.abs(p.x) <= TABLE.width / 2 && Math.abs(p.y) <= TABLE.length / 2)
      if (landing) target.position.set(landing.x, landing.y, TABLE.height + 0.004)

      renderer.render(scene, camera)
    }

    let raf = 0
    const loop = () => {
      render()
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [ball, predicted])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', color: 'white' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{ position: 'absolute', top: 16, left: 16, padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12, minWidth: 260 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Cannon Smash Web Prototype</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>Deterministic 10ms ball sim from source constants.</div>
        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          <div>ball: ({ball.x.toFixed(2)}, {ball.y.toFixed(2)}, {ball.z.toFixed(2)})</div>
          <div>vel: ({ball.vx.toFixed(2)}, {ball.vy.toFixed(2)}, {ball.vz.toFixed(2)})</div>
          <div>spin: {ball.spin.toFixed(2)} | status: {ball.status}</div>
        </div>
      </div>

      <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TouchPad label="Move/shot bias" onChange={setDrag} />
        <div style={{ padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
            Left panel is a placeholder mobile input concept. Drag changes the next reset shot bias.
            Red line is predicted trajectory; blue ring shows estimated landing.
          </div>
          <button onClick={() => setRunning((v) => !v)} style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, border: 0, background: '#7ed7ff', color: '#00131a', fontWeight: 700 }}>
            {running ? 'Pause sim' : 'Resume sim'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TouchPad({ label, onChange }: { label: string; onChange: (v: { x: number; y: number }) => void }) {
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
      onPointerUp={() => { setLocal({ x: 0, y: 0, active: false }); onChange({ x: 0, y: 0 }) }}
      onPointerCancel={() => { setLocal({ x: 0, y: 0, active: false }); onChange({ x: 0, y: 0 }) }}
      style={{ position: 'relative', minHeight: 140, background: 'rgba(0,0,0,0.45)', borderRadius: 12, touchAction: 'none', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: 12, left: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 100, height: 100, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: `calc(50% + ${local.x * 36}px - 14px)`, top: `calc(50% - ${local.y * 36}px - 14px)`, width: 28, height: 28, borderRadius: '50%', background: '#7ed7ff' }} />
        </div>
      </div>
    </div>
  )
}
