import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  TABLE,
  TICK,
  applyShot,
  consumeImpact,
  createIdleBall,
  createNeutralBallForSide,
  createPlayer,
  createSimpleReturnShot,
  findTableBounce,
  isBallHittableForSide,
  sampleTrajectory,
  solveTargetToV,
  solveTargetToVS,
  startSwing,
  stepBall,
  stepPlayer,
  tossForServe,
  type BallState,
  type PlayerState,
  type ShotSolution,
} from '@csmash/core'

const BG = '#0f1115'

type Vec2 = { x: number; y: number }

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const pressStartRef = useRef<number | null>(null)
  const aiCooldownRef = useRef(0)

  const [ball, setBall] = useState<BallState>(() => createIdleBall())
  const [player, setPlayer] = useState<PlayerState>(() => createPlayer(1))
  const [opponent, setOpponent] = useState<PlayerState>(() => createPlayer(-1))
  const [running, setRunning] = useState(true)
  const [target, setTarget] = useState<Vec2>({ x: 0, y: TABLE.length / 4 })
  const [spin, setSpin] = useState(0.35)
  const [level, setLevel] = useState(0.8)
  const [serveMode, setServeMode] = useState(false)
  const [lastShot, setLastShot] = useState<ShotSolution | null>(null)
  const [shotQueued, setShotQueued] = useState<ShotSolution | null>(null)
  const [score, setScore] = useState({ you: 0, opp: 0 })
  const [message, setMessage] = useState('Aim, then hold/release to swing.')

  const predicted = useMemo(() => sampleTrajectory(ball, 260), [ball])
  const landing = useMemo(() => findTableBounce(predicted), [predicted])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      aiCooldownRef.current = Math.max(0, aiCooldownRef.current - 1)

      setPlayer((prev) => {
        let next = stepPlayer(prev)
        const impact = consumeImpact(next)
        next = impact.player
        if (impact.shot) {
          setBall((prevBall) => applyShot(prevBall, impact.shot!))
          setLastShot(impact.shot)
          setShotQueued(null)
        }
        return next
      })

      setOpponent((prev) => {
        let next = stepPlayer(prev)
        const impact = consumeImpact(next)
        next = impact.player
        if (impact.shot) {
          setBall((prevBall) => applyShot(prevBall, impact.shot!))
          setMessage('Opponent returns!')
        }
        return next
      })

      setBall((prev) => {
        const next = stepBall(prev)

        if (next.status < 0 && prev.status >= 0) {
          const oppWon = prev.status === 3 || prev.status === 4 || prev.status === 6
          setScore((s) => oppWon ? { ...s, opp: s.opp + 1 } : { ...s, you: s.you + 1 })
          setMessage(oppWon ? 'Point to opponent.' : 'Point to you.')
          aiCooldownRef.current = 0
          setShotQueued(null)
          setPlayer(createPlayer(1))
          setOpponent(createPlayer(-1))
          return createIdleBall()
        }

        if (isBallHittableForSide(next, -1) && aiCooldownRef.current === 0) {
          const aiBall = createNeutralBallForSide(-1)
          aiBall.x = next.x
          aiBall.y = next.y
          aiBall.z = next.z
          aiBall.vx = next.vx
          aiBall.vy = next.vy
          aiBall.vz = next.vz
          aiBall.spin = next.spin
          aiBall.status = next.status
          const aiShot = createSimpleReturnShot(aiBall, -1)
          setOpponent((prevOpp) => startSwing(prevOpp, aiShot))
          aiCooldownRef.current = 65
          setMessage('Opponent preparing a return...')
        }

        return next
      })
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

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1))
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
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(TABLE.width / 2, TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(-TABLE.width / 2, TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(-TABLE.width / 2, -TABLE.length / 2, TABLE.height + 0.002),
    ]), lineMat))
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -TABLE.length / 2, TABLE.height + 0.002),
      new THREE.Vector3(0, TABLE.length / 2, TABLE.height + 0.002),
    ]), lineMat))

    const net = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, 0.02, TABLE.netHeight), new THREE.MeshPhongMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.85 }))
    net.position.set(0, 0, TABLE.height + TABLE.netHeight / 2)
    scene.add(net)

    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(TABLE.ballRadius, 24, 24), new THREE.MeshStandardMaterial({ color: 0xffc62b, emissive: 0x442200 }))
    scene.add(ballMesh)

    const playerMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 6, 12), new THREE.MeshPhongMaterial({ color: 0x98c1ff }))
    const oppMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 6, 12), new THREE.MeshPhongMaterial({ color: 0xffc7b0 }))
    scene.add(playerMesh)
    scene.add(oppMesh)

    const racket = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshPhongMaterial({ color: 0xff8f70 }))
    const oppRacket = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshPhongMaterial({ color: 0xffd46d }))
    scene.add(racket)
    scene.add(oppRacket)

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(TABLE.ballRadius * 1.4, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }))
    shadow.rotation.x = -Math.PI / 2
    scene.add(shadow)

    const trajGeom = new THREE.BufferGeometry()
    const trajLine = new THREE.Line(trajGeom, new THREE.LineBasicMaterial({ color: 0xff6b6b }))
    scene.add(trajLine)

    const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 32), new THREE.MeshBasicMaterial({ color: 0x7ed7ff, side: THREE.DoubleSide }))
    targetRing.rotation.x = -Math.PI / 2
    scene.add(targetRing)

    const landingRing = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 32), new THREE.MeshBasicMaterial({ color: 0xff6b6b, side: THREE.DoubleSide }))
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

      playerMesh.position.set(player.x, player.y, player.z)
      oppMesh.position.set(opponent.x, opponent.y, opponent.z)

      const swingPhase = player.swingState === 'backswing' ? -0.12 : player.swingState === 'impact' ? 0.22 : player.swingState === 'recovery' ? 0.12 : 0.02
      racket.position.set(player.x + 0.18 + swingPhase, player.y + 0.02, player.z + 0.16)
      racket.rotation.y = -Math.PI / 5

      const oppSwingPhase = opponent.swingState === 'backswing' ? 0.12 : opponent.swingState === 'impact' ? -0.22 : opponent.swingState === 'recovery' ? -0.12 : -0.02
      oppRacket.position.set(opponent.x - 0.18 + oppSwingPhase, opponent.y - 0.02, opponent.z + 0.16)
      oppRacket.rotation.y = Math.PI / 5

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
  }, [ball, predicted, landing, target, player, opponent])

  const queueShot = (nextLevel = level) => {
    if (!serveMode && !isBallHittableForSide(ball, 1) && ball.status !== 8) {
      setMessage('Ball not in your hittable window yet.')
      return
    }

    const baseBall = serveMode
      ? tossForServe(1)
      : ball.status === 8 ? createNeutralBallForSide(1) : { ...ball }

    const shot = serveMode
      ? solveTargetToVS(baseBall, target.x, target.y, nextLevel, spin)
      : solveTargetToV(baseBall, target.x, target.y, nextLevel, spin)

    setShotQueued(shot)
    setPlayer((prev) => startSwing(prev, shot))
    setBall(baseBall)
    setMessage(serveMode ? 'Serve swing started.' : 'Swing started.')
  }

  const resetIdle = () => {
    setBall(createIdleBall())
    setPlayer(createPlayer(1))
    setOpponent(createPlayer(-1))
    setLastShot(null)
    setShotQueued(null)
    setMessage('Reset.')
  }

  const pointerDownSwing = () => {
    pressStartRef.current = performance.now()
  }

  const pointerUpSwing = () => {
    const started = pressStartRef.current
    pressStartRef.current = null
    const held = started ? Math.min(1, (performance.now() - started) / 800) : 0
    const nextLevel = 0.45 + held * 0.55
    setLevel(nextLevel)
    queueShot(nextLevel)
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', color: 'white' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      <div style={{ position: 'absolute', top: 16, left: 16, padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12, minWidth: 290 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Cannon Smash Rally Prototype</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>Swing timing + opponent return + point reset.</div>
        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          <div>score: you {score.you} — {score.opp} opp</div>
          <div>ball status: {ball.status}</div>
          <div>your swing: {player.swingState} @ {player.swingTimer}</div>
          <div>opp swing: {opponent.swingState} @ {opponent.swingTimer}</div>
          <div>{message}</div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 16, right: 16, width: 304, padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Aim / stroke</div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>Target X: {target.x.toFixed(2)}</div>
        <input type="range" min={-TABLE.width / 2 + 0.06} max={TABLE.width / 2 - 0.06} step={0.01} value={target.x} onChange={(e) => setTarget((t) => ({ ...t, x: Number(e.target.value) }))} style={{ width: '100%' }} />
        <div style={{ fontSize: 12, margin: '8px 0 6px' }}>Target Y: {target.y.toFixed(2)}</div>
        <input type="range" min={0.12} max={TABLE.length / 2 - 0.08} step={0.01} value={target.y} onChange={(e) => setTarget((t) => ({ ...t, y: Number(e.target.value) }))} style={{ width: '100%' }} />
        <div style={{ fontSize: 12, margin: '8px 0 6px' }}>Spin: {spin.toFixed(2)}</div>
        <input type="range" min={-1.2} max={1.2} step={0.01} value={spin} onChange={(e) => setSpin(Number(e.target.value))} style={{ width: '100%' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
          <input type="checkbox" checked={serveMode} onChange={(e) => setServeMode(e.target.checked)} />
          Serve mode
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onPointerDown={pointerDownSwing} onPointerUp={pointerUpSwing} onPointerCancel={pointerUpSwing} style={btn}>Hold / release swing</button>
          <button onClick={resetIdle} style={btnGhost}>Reset</button>
          <button onClick={() => setRunning((v) => !v)} style={btnGhost}>{running ? 'Pause' : 'Resume'}</button>
        </div>
        {shotQueued && <div style={{ fontSize: 12, marginTop: 10, opacity: 0.9 }}>queued impact shot ready</div>}
        {lastShot && <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, opacity: 0.9 }}>last shot: ({lastShot.vx.toFixed(2)}, {lastShot.vy.toFixed(2)}, {lastShot.vz.toFixed(2)})</div>}
      </div>

      <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TouchPad label="Drag-to-aim" onChange={(v) => setTarget({ x: v.x * (TABLE.width / 2 - 0.08), y: ((v.y + 1) / 2) * (TABLE.length / 2 - 0.14) + 0.07 })} />
        <div style={{ padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
            You can only swing during a hittable rally window or from idle serve state. The opponent now performs simple automatic returns, and the rally resets into a scored dead-ball state when the point ends.
          </div>
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: 0, background: '#7ed7ff', color: '#00131a', fontWeight: 700 }
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
