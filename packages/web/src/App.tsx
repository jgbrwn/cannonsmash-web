import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  TABLE,
  TICK,
  ARCHETYPES,
  applyShot,
  buildStrokePlan,
  chooseAIReturnShot,
  createIdleBall,
  createNeutralBallForSide,
  createPlayer,
  findTableBounce,
  getHandSideForBall,
  getPlayerContactMetrics,
  getPlayerStanceOffset,
  getStatusRatio,
  isBallHittableForSide,
  pickAIMoveTarget,
  predictContactPoint,
  resolveImpact,
  sampleTrajectory,
  setPlayerTarget,
  solveTargetToV,
  solveTargetToVS,
  startSwing,
  stepBall,
  stepPlayer,
  tossForServe,
  type BallState,
  type HandSide,
  type PlayerArchetype,
  type PlayerState,
  type ShotFamily,
  type ShotSolution,
} from '@csmash/core'

const BG = '#0f1115'

type Vec2 = { x: number; y: number }

type MatchState = {
  server: 1 | -1
  servesUsed: number
  gameOver: boolean
  winner: 'you' | 'opp' | null
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const pressStartRef = useRef<number | null>(null)
  const aiCooldownRef = useRef(0)
  const aiPlanRef = useRef<{ swingAt: number; shot: ShotSolution; attack: boolean; family: ShotFamily; hand: HandSide } | null>(null)
  const ballRef = useRef<BallState>(createIdleBall())
  const playerRef = useRef<PlayerState>(createPlayer(1, 'PenAttack'))
  const opponentRef = useRef<PlayerState>(createPlayer(-1, 'ShakeCut'))

  const [ball, setBall] = useState<BallState>(() => createIdleBall())
  const [playerArchetype, setPlayerArchetype] = useState<PlayerArchetype>('PenAttack')
  const [oppArchetype, setOppArchetype] = useState<PlayerArchetype>('ShakeCut')
  const [player, setPlayer] = useState<PlayerState>(() => createPlayer(1, 'PenAttack'))
  const [opponent, setOpponent] = useState<PlayerState>(() => createPlayer(-1, 'ShakeCut'))
  const [running, setRunning] = useState(true)
  const [target, setTarget] = useState<Vec2>({ x: 0, y: TABLE.length / 4 })
  const [spin, setSpin] = useState(0.35)
  const [level, setLevel] = useState(0.8)
  const [serveMode, setServeMode] = useState(false)
  const [lastShot, setLastShot] = useState<ShotSolution | null>(null)
  const [shotQueued, setShotQueued] = useState<ShotSolution | null>(null)
  const [score, setScore] = useState({ you: 0, opp: 0 })
  const [match, setMatch] = useState<MatchState>({ server: 1, servesUsed: 0, gameOver: false, winner: null })
  const [message, setMessage] = useState('Aim, then hold/release to swing.')

  const isYourServe = match.server === 1
  const effectiveServeMode = serveMode || ball.status === 8

  useEffect(() => { ballRef.current = ball }, [ball])
  useEffect(() => { playerRef.current = player }, [player])
  useEffect(() => { opponentRef.current = opponent }, [opponent])
  useEffect(() => {
    const nextPlayer = createPlayer(1, playerArchetype)
    playerRef.current = nextPlayer
    setPlayer(nextPlayer)
  }, [playerArchetype])
  useEffect(() => {
    const nextOpponent = createPlayer(-1, oppArchetype)
    opponentRef.current = nextOpponent
    setOpponent(nextOpponent)
  }, [oppArchetype])

  const predicted = useMemo(() => sampleTrajectory(ball, 260), [ball])
  const landing = useMemo(() => findTableBounce(predicted), [predicted])
  const playerContact = useMemo(() => getPlayerContactMetrics(player, ball), [player, ball])
  const playerHand = useMemo(() => getHandSideForBall(player, ball), [player, ball])
  const contactPrediction = useMemo(() => predictContactPoint(ball, 1, 180, playerHand), [ball, playerHand])
  const opponentPrediction = useMemo(() => predictContactPoint(ball, -1, 180, getHandSideForBall(opponent, ball)), [ball, opponent])
  const playerStatusRatio = useMemo(() => getStatusRatio(player), [player])
  const oppStatusRatio = useMemo(() => getStatusRatio(opponent), [opponent])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      aiCooldownRef.current = Math.max(0, aiCooldownRef.current - 1)

      let nextBall = stepBall(ballRef.current)
      let nextPlayer = playerRef.current
      let nextOpponent = opponentRef.current
      let nextMessage: string | null = null
      let nextLastShot: ShotSolution | null = null
      let clearQueuedShot = false

      if (nextBall.status < 0 && ballRef.current.status >= 0) {
        const oppWon = ballRef.current.status === 3 || ballRef.current.status === 4 || ballRef.current.status === 6
        let nextScore = score
        setScore((s) => {
          nextScore = oppWon ? { ...s, opp: s.opp + 1 } : { ...s, you: s.you + 1 }
          return nextScore
        })
        setMatch((m) => {
          const totalPoints = nextScore.you + nextScore.opp
          const gameOver = (nextScore.you >= 11 || nextScore.opp >= 11) && Math.abs(nextScore.you - nextScore.opp) >= 2
          const winner = gameOver ? (nextScore.you > nextScore.opp ? 'you' : 'opp') : null
          const rotation = totalPoints >= 20 ? totalPoints : Math.floor(totalPoints / 2)
          const nextServer = gameOver ? m.server : (rotation % 2 === 0 ? 1 : -1)
          return { server: nextServer, servesUsed: totalPoints >= 20 ? totalPoints % 2 : totalPoints % 2, gameOver, winner }
        })
        aiCooldownRef.current = 0
        nextMessage = gamePointMessage(nextScore, oppWon)
        nextBall = createIdleBall()
        nextPlayer = createPlayer(1, playerArchetype)
        nextOpponent = createPlayer(-1, oppArchetype)
        aiPlanRef.current = null
        clearQueuedShot = true
      } else {
        const playerPlan = predictContactPoint(nextBall, 1)
        const oppPlan = pickAIMoveTarget(nextOpponent, nextBall)

        if (ballRef.current.status === 8) {
          if (match.server === -1 && aiCooldownRef.current === 0 && nextOpponent.swingState === 'idle') {
            const serveBall = tossForServe(-1)
            const serveChoice = chooseAIReturnShot(nextOpponent, serveBall)
            nextBall = serveBall
            nextOpponent = startSwing(nextOpponent, serveChoice.stroke.shot, serveChoice.stroke.family, serveChoice.stroke.hand)
            aiCooldownRef.current = 80
            nextMessage = 'Opponent begins the serve...'
          }
        }

        if (!serveMode && playerPlan && nextPlayer.swingState === 'idle') {
          nextPlayer = setPlayerTarget(nextPlayer, playerPlan.playerX, playerPlan.playerY, getHandSideForBall(nextPlayer, playerPlan.ball))
        }
        if (oppPlan) {
          nextOpponent = setPlayerTarget(nextOpponent, oppPlan.playerX, oppPlan.playerY, getHandSideForBall(nextOpponent, oppPlan.ball))
        }

        if (isBallHittableForSide(nextBall, -1) && nextOpponent.swingState === 'idle') {
          if (!aiPlanRef.current) {
            const choice = chooseAIReturnShot(nextOpponent, { ...nextBall })
            const planTicks = Math.max(1, (oppPlan?.etaTicks ?? 18) - 19)
            aiPlanRef.current = {
              swingAt: planTicks,
              shot: choice.stroke.shot,
              attack: choice.attack,
              family: choice.stroke.family,
              hand: choice.stroke.hand,
            }
            nextMessage = choice.attack
              ? `Opponent lines up a ${choice.stroke.hand} ${choice.stroke.family}...`
              : `Opponent reads a ${choice.stroke.hand} ${choice.stroke.family}...`
          }
          if (aiPlanRef.current) {
            aiPlanRef.current.swingAt -= 1
            if (aiPlanRef.current.swingAt <= 0 && aiCooldownRef.current === 0) {
              nextOpponent = startSwing(nextOpponent, aiPlanRef.current.shot, aiPlanRef.current.family, aiPlanRef.current.hand)
              aiCooldownRef.current = 65
              nextMessage = aiPlanRef.current.attack
                ? `Opponent commits late to a ${aiPlanRef.current.hand} attack!`
                : `Opponent commits late to a ${aiPlanRef.current.hand} ${aiPlanRef.current.family}.`
              aiPlanRef.current = null
            }
          }
        } else if (!isBallHittableForSide(nextBall, -1)) {
          aiPlanRef.current = null
        }

        nextPlayer = stepPlayer(nextPlayer)
        if (nextPlayer.swingState === 'impact') {
          const impact = resolveImpact(nextPlayer, nextBall)
          nextPlayer = impact.player
          clearQueuedShot = true
          if (impact.madeContact && impact.shot) {
            nextBall = applyShot(nextBall, impact.shot)
            nextLastShot = impact.shot
            nextMessage = impact.quality > 0.72
              ? 'Clean contact.'
              : impact.quality < 0.38
                ? 'Fatigued contact.'
                : impact.timingError > 0.05
                  ? 'Late contact.'
                  : impact.timingError < -0.05
                    ? 'Early contact.'
                    : 'Reached and guided it back.'
          } else {
            nextMessage = playerStatusRatio < 0.3 ? 'Too drained — missed contact.' : 'Missed contact — get into position first.'
          }
        }

        nextOpponent = stepPlayer(nextOpponent)
        if (nextOpponent.swingState === 'impact') {
          const impact = resolveImpact(nextOpponent, nextBall)
          nextOpponent = impact.player
          if (impact.madeContact && impact.shot) {
            nextBall = applyShot(nextBall, impact.shot)
            nextMessage = impact.quality > 0.72
              ? 'Opponent times the return cleanly.'
              : getStatusRatio(nextOpponent) < 0.3
                ? 'Opponent lunges a tired return.'
                : 'Opponent scrambles a return!'
          } else {
            aiPlanRef.current = null
          }
        }
      }

      ballRef.current = nextBall
      playerRef.current = nextPlayer
      opponentRef.current = nextOpponent
      setBall(nextBall)
      setPlayer(nextPlayer)
      setOpponent(nextOpponent)
      if (nextLastShot) setLastShot(nextLastShot)
      if (clearQueuedShot) setShotQueued(null)
      if (nextMessage) setMessage(nextMessage)
    }, TICK * 1000)
    return () => clearInterval(id)
  }, [running, serveMode, playerArchetype, oppArchetype, playerStatusRatio, score, match])

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

    const playerReach = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 48), new THREE.MeshBasicMaterial({ color: 0x7ed7ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide }))
    const oppReach = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 48), new THREE.MeshBasicMaterial({ color: 0xffc7b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }))
    playerReach.rotation.x = -Math.PI / 2
    oppReach.rotation.x = -Math.PI / 2
    scene.add(playerReach)
    scene.add(oppReach)

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

      const playerStance = getPlayerStanceOffset(player)
      const oppStance = getPlayerStanceOffset(opponent)
      const swingPhase = player.swingState === 'backswing' ? -0.12 : player.swingState === 'impact' ? 0.22 : player.swingState === 'recovery' ? 0.12 : 0.02
      racket.position.set(playerContact.contactX + swingPhase * player.side, playerContact.contactY, playerContact.contactZ)
      racket.rotation.y = player.plannedHand === 'forehand' ? -Math.PI / 5 : Math.PI / 7
      playerReach.position.set(playerContact.contactX, playerContact.contactY, TABLE.height + 0.004)
      playerReach.scale.setScalar(ARCHETYPES[player.archetype].contactRadius / 0.38)
      playerMesh.rotation.z = player.plannedHand === 'forehand' ? -0.08 : 0.08
      playerMesh.position.x = player.x + playerStance.x * 0.35
      playerMesh.position.y = player.y + playerStance.y * 0.35

      const oppSwingPhase = opponent.swingState === 'backswing' ? 0.12 : opponent.swingState === 'impact' ? -0.22 : opponent.swingState === 'recovery' ? -0.12 : -0.02
      const oppContact = getPlayerContactMetrics(opponent, ball)
      oppRacket.position.set(oppContact.contactX + oppSwingPhase * opponent.side, oppContact.contactY, oppContact.contactZ)
      oppRacket.rotation.y = opponent.plannedHand === 'forehand' ? Math.PI / 5 : -Math.PI / 7
      oppReach.position.set(oppContact.contactX, oppContact.contactY, TABLE.height + 0.004)
      oppReach.scale.setScalar(ARCHETYPES[opponent.archetype].contactRadius / 0.38)
      oppMesh.rotation.z = opponent.plannedHand === 'forehand' ? 0.08 : -0.08
      oppMesh.position.x = opponent.x + oppStance.x * 0.35
      oppMesh.position.y = opponent.y + oppStance.y * 0.35

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
    if (match.gameOver) {
      setMessage(`Game over — ${match.winner === 'you' ? 'you win' : 'opponent wins'}. Reset to play again.`)
      return
    }
    if (ball.status === 8 && !isYourServe) {
      setMessage('Waiting for opponent serve.')
      return
    }
    if (!effectiveServeMode && !isBallHittableForSide(ball, 1) && ball.status !== 8) {
      setMessage('Ball not on your side yet.')
      return
    }

    const baseBall = effectiveServeMode
      ? tossForServe(1)
      : ball.status === 8 ? createNeutralBallForSide(1) : { ...ball }

    const stroke = effectiveServeMode
      ? { shot: solveTargetToVS(baseBall, target.x, target.y, nextLevel, spin), family: 'drive' as ShotFamily, hand: 'forehand' as HandSide }
      : buildStrokePlan(playerRef.current, baseBall, target.x, target.y, nextLevel, spin)

    const nextPlayer = startSwing(playerRef.current, stroke.shot, stroke.family, stroke.hand)
    playerRef.current = nextPlayer
    ballRef.current = baseBall
    setShotQueued(stroke.shot)
    setPlayer(nextPlayer)
    setBall(baseBall)
    setMessage(effectiveServeMode ? 'Serve swing started — move through the ball.' : `Swing started — ${stroke.hand} ${stroke.family}.`)
  }

  const resetIdle = () => {
    const idleBall = createIdleBall()
    const idlePlayer = createPlayer(1, playerArchetype)
    const idleOpponent = createPlayer(-1, oppArchetype)
    aiPlanRef.current = null
    ballRef.current = idleBall
    playerRef.current = idlePlayer
    opponentRef.current = idleOpponent
    setBall(idleBall)
    setPlayer(idlePlayer)
    setOpponent(idleOpponent)
    setScore({ you: 0, opp: 0 })
    setMatch({ server: 1, servesUsed: 0, gameOver: false, winner: null })
    setLastShot(null)
    setShotQueued(null)
    setMessage('Reset match. You serve first.')
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
          <div>serve: {isYourServe ? 'you' : 'opp'} {match.gameOver ? '· game over' : ''}</div>
          <div>ball status: {ball.status}</div>
          <div>you: {player.archetype} · status {(playerStatusRatio * 100).toFixed(0)}%</div>
          <div>opp: {opponent.archetype} · status {(oppStatusRatio * 100).toFixed(0)}%</div>
          <div>your pos: {player.x.toFixed(2)}, {player.y.toFixed(2)} · stance {playerHand}</div>
          <div>your reach: {playerContact.distance.toFixed(2)} {playerContact.reachable ? '✓' : '×'}</div>
          <div>your swing: {player.swingState} @ {player.swingTimer} · {player.plannedHand} {player.plannedFamily}</div>
          <div>opp swing: {opponent.swingState} @ {opponent.swingTimer} · {opponent.plannedHand} {opponent.plannedFamily}</div>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, opacity: isYourServe ? 1 : 0.55 }}>
          <input type="checkbox" checked={serveMode} disabled={!isYourServe} onChange={(e) => setServeMode(e.target.checked)} />
          Serve mode
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <label style={{ fontSize: 12 }}>
            You
            <select value={playerArchetype} onChange={(e) => setPlayerArchetype(e.target.value as PlayerArchetype)} style={selectStyle}>
              {Object.keys(ARCHETYPES).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            Opp
            <select value={oppArchetype} onChange={(e) => setOppArchetype(e.target.value as PlayerArchetype)} style={selectStyle}>
              {Object.keys(ARCHETYPES).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onPointerDown={pointerDownSwing} onPointerUp={pointerUpSwing} onPointerCancel={pointerUpSwing} style={btn}>Hold / release swing</button>
          <button onClick={resetIdle} style={btnGhost}>Reset</button>
          <button onClick={() => setRunning((v) => !v)} style={btnGhost}>{running ? 'Pause' : 'Resume'}</button>
        </div>
        {shotQueued && <div style={{ fontSize: 12, marginTop: 10, opacity: 0.9 }}>queued impact shot ready</div>}
        {ball.status === 8 && <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>{isYourServe ? 'ready to serve' : 'waiting for opponent serve'}</div>}
        {contactPrediction && <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>assist intercept in {(contactPrediction.etaTicks * TICK).toFixed(2)}s</div>}
        {opponentPrediction && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.75 }}>opp intercept in {(opponentPrediction.etaTicks * TICK).toFixed(2)}s</div>}
        {aiPlanRef.current && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.75 }}>opp swing commit in {(Math.max(0, aiPlanRef.current.swingAt) * TICK).toFixed(2)}s</div>}
        {lastShot && <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, opacity: 0.9 }}>last shot: ({lastShot.vx.toFixed(2)}, {lastShot.vy.toFixed(2)}, {lastShot.vz.toFixed(2)})</div>}
      </div>

      <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TouchPad label="Drag-to-aim" onChange={(v) => setTarget({ x: v.x * (TABLE.width / 2 - 0.08), y: ((v.y + 1) / 2) * (TABLE.length / 2 - 0.14) + 0.07 })} />
        <div style={{ padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
            Match flow now tracks serves and game end: serve ownership rotates across points, opponent can initiate its own serve, and the prototype now plays to 11 with a two-point margin.
          </div>
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: 0, background: '#7ed7ff', color: '#00131a', fontWeight: 700 }
const btnGhost: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: 'white', fontWeight: 700 }
const selectStyle: React.CSSProperties = { width: '100%', marginTop: 4, borderRadius: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.14)' }

function gamePointMessage(score: { you: number; opp: number }, oppWon: boolean): string {
  const gameOver = (score.you >= 11 || score.opp >= 11) && Math.abs(score.you - score.opp) >= 2
  if (gameOver) return oppWon ? 'Game to opponent.' : 'Game to you.'
  return oppWon ? 'Point to opponent.' : 'Point to you.'
}

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
