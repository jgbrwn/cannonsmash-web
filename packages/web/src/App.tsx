import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  TABLE,
  TICK,
  ARCHETYPES,
  applyShot,
  buildOpeningStrokePlan,
  buildRallyStrokePlan,
  buildStrokePlan,
  chooseAIReturnShot,
  analyzeServe,
  createIdleBall,
  createNeutralBallForSide,
  createPlayer,
  detectStrokeContext,
  findContactPointForPhase,
  findTableBounce,
  getCadenceWindow,
  getDecisionLeadTicks,
  getHandSideForBall,
  shouldResolveOpeningPhase,
  getPlayerContactMetrics,
  getPlayerStanceOffset,
  getStatusRatio,
  getSwingImpactTick,
  getNextRallySequenceState,
  inferRallyPatternFromShot,
  isBallHittableForSide,
  pickAIMoveTarget,
  predictContactPoint,
  resolveImpact,
  sampleTrajectory,
  setPlayerTarget,
  startSwing,
  stepBall,
  stepPlayer,
  tossForServe,
  type BallState,
  type HandSide,
  type PlayerArchetype,
  type PlayerState,
  type ReceivePressure,
  type RallyPattern,
  type RallySequenceState,
  type ShotFamily,
  type ShotSolution,
  type ServePattern,
  type StrokeContext,
} from '@csmash/core'

const BG = '#0f1115'

type Vec2 = { x: number; y: number }

type MatchState = {
  server: 'you' | 'opp'
  servesUsed: number
  gameOver: boolean
  winner: 'you' | 'opp' | null
  games: { you: number; opp: number }
  gameNumber: number
  matchOver: boolean
  matchWinner: 'you' | 'opp' | null
  sidesSwapped: boolean
  deciderSwitchDone: boolean
  betweenGames: boolean
  transitionText: string | null
}

const getTempoRead = (sequence: RallySequenceState) => (
  sequence.dominant === 'pressure' && sequence.streak >= 2
    ? 'heavy exchange'
    : sequence.dominant === 'counter' && sequence.streak >= 2
      ? 'stable trade'
      : sequence.dominant === 'reset' && sequence.streak >= 2
        ? 'recovery ball'
        : 'mixed'
)

const getTempoBadge = (sequence: RallySequenceState) => (
  sequence.dominant === 'pressure' && sequence.streak >= 2
    ? 'tempo: pressure on'
    : sequence.dominant === 'counter' && sequence.streak >= 2
      ? 'tempo: trade settled'
      : sequence.dominant === 'reset' && sequence.streak >= 2
        ? 'tempo: buying time'
        : null
)

const getArchetypeTone = (archetype: PlayerArchetype) => (
  archetype === 'PenAttack'
    ? {
        pressure: { shift: 'Pressure on — step in and stay on it.', reopen: 'You reopen fast off the softer ball — pressure back on.' },
        counter: 'Counter trade settles — stay ready to jump.',
        reset: 'Reset buys time — recover and look to reopen.',
      }
    : archetype === 'PenDrive'
      ? {
          pressure: { shift: 'Rally tightens — drive pressure is building.', reopen: 'You drive back in off the softer ball — pressure back on.' },
          counter: 'Counter trade settles — the drive exchange is on.',
          reset: 'Reset buys time — rebuild the rally shape.',
        }
      : {
          pressure: { shift: 'Rally tightens — spin pressure is building.', reopen: 'You turn defense into pressure off the softer ball.' },
          counter: 'Counter trade settles — absorb pace and stay balanced.',
          reset: 'Reset buys time — plenty of room to recover shape.',
        }
)

const describeTempoShift = (previous: RallySequenceState, next: RallySequenceState, actor: 'you' | 'opp', archetype: PlayerArchetype) => {
  if (!next.dominant || next.streak < 2) return null
  if (previous.dominant === next.dominant && previous.streak >= 2) return null

  const tone = getArchetypeTone(archetype)
  if (actor === 'you') {
    if (next.dominant === 'pressure') return previous.dominant === 'reset' && previous.streak >= 2 ? tone.pressure.reopen : tone.pressure.shift
    if (next.dominant === 'counter') return tone.counter
    return tone.reset
  }

  if (next.dominant === 'pressure') {
    if (previous.dominant === 'reset' && previous.streak >= 2) {
      return archetype === 'ShakeCut'
        ? 'Opponent turns the soft ball into fresh pressure.'
        : archetype === 'PenDrive'
          ? 'Opponent drives back in off the softer ball — pressure back on.'
          : 'Opponent reopens off the softer ball — pressure back on.'
    }
    return archetype === 'ShakeCut'
      ? 'Opponent starts tightening the rally through spin.'
      : archetype === 'PenDrive'
        ? 'Opponent leans into a firmer drive trade.'
        : 'Opponent steps in and turns the pressure up.'
  }

  if (next.dominant === 'counter') {
    return archetype === 'ShakeCut'
      ? 'Opponent settles into a measured trade.'
      : archetype === 'PenDrive'
        ? 'Opponent looks comfortable in the drive trade.'
        : 'Opponent is happy to counter-trade.'
  }

  return archetype === 'ShakeCut'
    ? 'Opponent drops in a safer reset to recover shape.'
    : archetype === 'PenDrive'
      ? 'Opponent rolls a reset ball to steady the exchange.'
      : 'Opponent buys time with a softer reset ball.'
}

const describeTempoContact = (actor: 'you' | 'opp', archetype: PlayerArchetype, sequence: RallySequenceState, quality: number, timingError: number, context: StrokeContext, family: ShotFamily, receivePressure: ReceivePressure | null | undefined, statusRatio: number) => {
  if (quality > 0.72) {
    if (sequence.dominant === 'pressure' && sequence.streak >= 2) {
      if (actor === 'you') return archetype === 'ShakeCut' ? 'Clean pressure ball — spin is starting to bite.' : archetype === 'PenDrive' ? 'Clean pressure ball — keep driving through it.' : 'Clean contact — stay on top of the pressure.'
      return archetype === 'ShakeCut' ? 'Opponent keeps loading the rally with pressure spin.' : archetype === 'PenDrive' ? 'Opponent keeps the drive pressure firm.' : 'Opponent keeps the pressure rally tight.'
    }
    if (sequence.dominant === 'counter' && sequence.streak >= 2) {
      if (actor === 'you') return archetype === 'PenAttack' ? 'Clean counter — good ball to hold the trade.' : archetype === 'PenDrive' ? 'Clean counter — the drive trade stays solid.' : 'Clean counter — you stay balanced through the exchange.'
      return archetype === 'PenAttack' ? 'Opponent stays sharp in the counter trade.' : archetype === 'PenDrive' ? 'Opponent keeps the drive trade stable.' : 'Opponent keeps the exchange balanced.'
    }
    if (sequence.dominant === 'reset' && sequence.streak >= 2) {
      if (actor === 'you') return archetype === 'ShakeCut' ? 'Clean reset — plenty of shape on the recovery ball.' : archetype === 'PenDrive' ? 'Clean reset — enough time to rebuild the drive.' : 'Clean reset — buying time to attack again.'
      return archetype === 'ShakeCut' ? 'Opponent floats a shaped reset to recover.' : archetype === 'PenDrive' ? 'Opponent rolls a reset to steady the rally.' : 'Opponent floats a reset to buy time.'
    }
    return actor === 'you' ? 'Clean contact.' : 'Opponent times the return cleanly.'
  }

  if (quality < 0.38) {
    if (context === 'opener' && family === 'attack') {
      return actor === 'you' ? 'First attack was too low to lift cleanly.' : 'Opponent forces a low first attack and loses shape.'
    }
    if (receivePressure === 'high') {
      return actor === 'you' ? 'Pressured receive broke down.' : 'Opponent buckles under receive pressure.'
    }
    if (sequence.dominant === 'pressure' && sequence.streak >= 2) {
      return actor === 'you'
        ? archetype === 'ShakeCut' ? 'Heavy pressure is forcing a rushed recovery.' : 'Heavy rally pressure is starting to rush you.'
        : archetype === 'PenAttack' ? 'Opponent is rushing under the heavy exchange.' : 'Opponent is losing shape under the pressure.'
    }
    return actor === 'you' ? 'Fatigued contact.' : statusRatio < 0.3 ? 'Opponent lunges a tired return.' : 'Opponent scrambles a return!'
  }

  if (timingError > 0.05) return actor === 'you' ? 'Late contact.' : 'Opponent is late on the ball.'
  if (timingError < -0.05) return actor === 'you' ? 'Early contact.' : 'Opponent reaches too early.'
  if (sequence.dominant === 'reset' && sequence.streak >= 2) {
    return actor === 'you' ? 'Guided a safer recovery ball back.' : 'Opponent guides back a safer recovery ball.'
  }
  return actor === 'you' ? 'Reached and guided it back.' : 'Opponent scrambles a return!'
}

const getMessagePriority = (message: string | null) => {
  if (!message) return 0
  if (message.includes('Match to') || message.includes('Game to') || message.includes('Game won') || message.includes('Game lost')) return 6
  if (message.includes('fault') || message.includes('Match over') || message.includes('Reset match')) return 5
  if (message.includes('rally opens') || message.includes('opens up') || message.includes('switch ends')) return 4
  if (message.includes('pressure back on') || message.includes('Pressure on') || message.includes('Rally tightens') || message.includes('Counter trade settles') || message.includes('Reset buys time') || message.includes('Opponent starts') || message.includes('Opponent steps in') || message.includes('Opponent settles into') || message.includes('Opponent drops in') || message.includes('Opponent buys time')) return 3
  if (message.includes('Clean') || message.includes('Late contact') || message.includes('Early contact') || message.includes('guided it back') || message.includes('scrambles') || message.includes('tired return') || message.includes('rushed')) return 2
  return 1
}

const chooseMessage = (current: string | null, candidate: string | null) => {
  if (!candidate) return current
  if (!current) return candidate
  return getMessagePriority(candidate) >= getMessagePriority(current) ? candidate : current
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const pressStartRef = useRef<number | null>(null)
  const aiCooldownRef = useRef(0)
  const aiPlanRef = useRef<{ swingAt: number; shot: ShotSolution; attack: boolean; family: ShotFamily; hand: HandSide; context: 'serve' | 'receive' | 'opener' | 'rally'; servePattern?: ServePattern; thirdBallAttack: boolean; commitStyle: 'early-take' | 'balanced' | 'late-read'; rallyPattern: RallyPattern } | null>(null)
  const fxRef = useRef({ flash: 0, pulse: 0, bounce: 0, pulseColor: '#7ed7ff' })
  const audioRef = useRef<AudioContext | null>(null)
  const audioEnabledRef = useRef(false)
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
  const [liveRallyPattern, setLiveRallyPattern] = useState<RallyPattern | null>(null)
  const [rallySequence, setRallySequence] = useState<RallySequenceState>({ latest: null, dominant: null, streak: 0 })
  const [shotQueued, setShotQueued] = useState<ShotSolution | null>(null)
  const [score, setScore] = useState({ you: 0, opp: 0 })
  const [match, setMatch] = useState<MatchState>({
    server: 'you',
    servesUsed: 0,
    gameOver: false,
    winner: null,
    games: { you: 0, opp: 0 },
    gameNumber: 1,
    matchOver: false,
    matchWinner: null,
    sidesSwapped: false,
    deciderSwitchDone: false,
    betweenGames: false,
    transitionText: null,
  })
  const [message, setMessage] = useState('Aim, then hold/release to swing.')
  const [serveWindowHint, setServeWindowHint] = useState<string | null>(null)
  const [assistOpeningBias, setAssistOpeningBias] = useState(true)
  const [liveServePattern, setLiveServePattern] = useState<ServePattern | null>(null)
  const [liveReceivePressure, setLiveReceivePressure] = useState<ReceivePressure | null>(null)
  const [showMenu, setShowMenu] = useState(true)
  const [menuCollapsed, setMenuCollapsed] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [compactHud, setCompactHud] = useState(typeof window !== 'undefined' ? window.innerWidth < 700 : false)
  const [showDebugHud, setShowDebugHud] = useState(false)
  const [tempoBadge, setTempoBadge] = useState<string | null>(null)

  const displayYouSide = match.sidesSwapped ? -1 : 1
  const serverSide = match.server === 'you' ? displayYouSide : (-displayYouSide as 1 | -1)
  const isYourServe = match.server === 'you'
  const effectiveServeMode = serveMode || ball.status === 8

  useEffect(() => { ballRef.current = ball }, [ball])
  useEffect(() => { playerRef.current = player }, [player])
  useEffect(() => { opponentRef.current = opponent }, [opponent])
  useEffect(() => {
    const nextPlayer = createPlayer(displayYouSide, playerArchetype)
    playerRef.current = nextPlayer
    setPlayer(nextPlayer)
  }, [playerArchetype, displayYouSide])
  useEffect(() => {
    const nextOpponent = createPlayer(-displayYouSide as 1 | -1, oppArchetype)
    opponentRef.current = nextOpponent
    setOpponent(nextOpponent)
  }, [oppArchetype, displayYouSide])

  const predicted = useMemo(() => sampleTrajectory(ball, 260), [ball])
  const landing = useMemo(() => findTableBounce(predicted), [predicted])
  const playerContact = useMemo(() => getPlayerContactMetrics(player, ball), [player, ball])
  const playerHand = useMemo(() => getHandSideForBall(player, ball), [player, ball])
  const contactPrediction = useMemo(() => predictContactPoint(ball, player.side, 180, playerHand), [ball, playerHand, player.side])
  const opponentPrediction = useMemo(() => predictContactPoint(ball, opponent.side, 180, getHandSideForBall(opponent, ball)), [ball, opponent])
  const playerStatusRatio = useMemo(() => getStatusRatio(player), [player])
  const oppStatusRatio = useMemo(() => getStatusRatio(opponent), [opponent])
  const playerContext = useMemo<StrokeContext>(() => detectStrokeContext(player, ball), [player, ball])
  const openingPreview = useMemo(() => {
    const baseBall = ball.status === 8
      ? (isYourServe ? tossForServe(player.side) : createNeutralBallForSide(player.side))
      : ball
    return buildOpeningStrokePlan(player, baseBall, target.x, target.y, playerContext, liveServePattern ?? undefined)
  }, [ball, isYourServe, liveServePattern, player, playerContext, target.x, target.y])
  const rallyPreview = useMemo(() => {
    const baseBall = ball.status === 8
      ? (isYourServe ? tossForServe(player.side) : createNeutralBallForSide(player.side))
      : ball
    return buildRallyStrokePlan(player, baseBall, target.x, target.y, liveRallyPattern, rallySequence)
  }, [ball, isYourServe, liveRallyPattern, player, rallySequence, target.x, target.y])
  const defaultPreview = useMemo(() => {
    const baseBall = ball.status === 8
      ? (isYourServe ? tossForServe(player.side) : createNeutralBallForSide(player.side))
      : ball
    return buildStrokePlan(player, baseBall, target.x, target.y, level, spin, playerContext === 'serve')
  }, [ball, isYourServe, level, player, playerContext, player.side, spin, target.x, target.y])

  useEffect(() => {
    audioEnabledRef.current = soundEnabled
  }, [soundEnabled])

  useEffect(() => {
    const onResize = () => setCompactHud(window.innerWidth < 700)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!running || showMenu) return
    const id = setInterval(() => {
      aiCooldownRef.current = Math.max(0, aiCooldownRef.current - 1)

      const prevBall = ballRef.current
      let nextBall = stepBall(ballRef.current)
      let nextPlayer = playerRef.current
      let nextOpponent = opponentRef.current
      let nextMessage: string | null = null
      let nextLastShot: ShotSolution | null = null
      let clearQueuedShot = false

      if (nextBall.status < 0 && ballRef.current.status >= 0) {
        const playerMissSide = ballRef.current.status === 3 || ballRef.current.status === 4 || ballRef.current.status === 6
        const oppWon = playerMissSide ? player.side > 0 : player.side < 0
        let nextScore = score
        let pointMessage = ''
        let nextDisplaySide = displayYouSide
        setScore((s) => {
          nextScore = oppWon ? { ...s, opp: s.opp + 1 } : { ...s, you: s.you + 1 }
          return nextScore
        })
        setMatch((m) => {
          const totalPoints = nextScore.you + nextScore.opp
          const gameOver = (nextScore.you >= 11 || nextScore.opp >= 11) && Math.abs(nextScore.you - nextScore.opp) >= 2
          const winner = gameOver ? (nextScore.you > nextScore.opp ? 'you' : 'opp') : null
          const nextGames = gameOver
            ? winner === 'you'
              ? { ...m.games, you: m.games.you + 1 }
              : { ...m.games, opp: m.games.opp + 1 }
            : m.games
          const matchOver = nextGames.you >= 3 || nextGames.opp >= 3
          const matchWinner = matchOver ? (nextGames.you > nextGames.opp ? 'you' : 'opp') : null
          const enteringDecider = !gameOver && nextGames.you === 2 && nextGames.opp === 2
          const shouldSwitchMidGame = enteringDecider && !m.deciderSwitchDone && totalPoints >= 10
          const nextSidesSwapped = gameOver ? !m.sidesSwapped : shouldSwitchMidGame ? !m.sidesSwapped : m.sidesSwapped
          nextDisplaySide = nextSidesSwapped ? -1 : 1
          const rotation = totalPoints >= 20 ? totalPoints : Math.floor(totalPoints / 2)
          const nextServer = gameOver
            ? (winner === 'you' ? 'opp' : 'you')
            : (rotation % 2 === 0 ? 'you' : 'opp')
          const nextGameNumber = gameOver ? m.gameNumber + 1 : m.gameNumber
          const nextDeciderSwitchDone = gameOver ? false : shouldSwitchMidGame ? true : m.deciderSwitchDone
          const betweenGames = gameOver && !matchOver
          const transitionText = gameOver && !matchOver
            ? buildBetweenGameMessage(winner === 'you', nextGames, nextGameNumber, nextSidesSwapped, nextGames.you === 2 && nextGames.opp === 2)
            : shouldSwitchMidGame
              ? 'Deciding game: switch ends.'
              : null
          pointMessage = matchPointMessage(nextScore, nextGames, oppWon, matchOver, shouldSwitchMidGame)
          return {
            server: nextServer,
            servesUsed: gameOver ? 0 : (totalPoints >= 20 ? totalPoints % 2 : totalPoints % 2),
            gameOver,
            winner,
            games: nextGames,
            gameNumber: nextGameNumber,
            matchOver,
            matchWinner,
            sidesSwapped: nextSidesSwapped,
            deciderSwitchDone: nextDeciderSwitchDone,
            betweenGames,
            transitionText,
          }
        })
        aiCooldownRef.current = 0
        setLiveServePattern(null)
        setLiveReceivePressure(null)
        setLiveRallyPattern(null)
        setRallySequence({ latest: null, dominant: null, streak: 0 })
        setServeWindowHint(null)
        playTone(audioRef, audioEnabledRef, pointMessage.includes('Game to') ? 460 : pointMessage.includes('Match to') ? 620 : 360, pointMessage.includes('Game to') ? 0.12 : pointMessage.includes('Match to') ? 0.18 : 0.08, 'sawtooth', 0.018)
        if (pointMessage.includes('Game to') || pointMessage.includes('Match to')) {
          setTimeout(() => playTone(audioRef, audioEnabledRef, pointMessage.includes('Match to') ? 780 : 620, pointMessage.includes('Match to') ? 0.22 : 0.14, 'triangle', 0.016), 90)
        }
        nextMessage = chooseMessage(nextMessage, pointMessage)
        nextBall = createIdleBall()
        nextPlayer = createPlayer(nextDisplaySide, playerArchetype)
        nextOpponent = createPlayer(-nextDisplaySide as 1 | -1, oppArchetype)
        aiPlanRef.current = null
        setTempoBadge(null)
        clearQueuedShot = true
      } else {
        const playerPlan = predictContactPoint(nextBall, player.side)
        const oppPlan = pickAIMoveTarget(nextOpponent, nextBall)

        if (ballRef.current.status === 8) {
          if (serverSide === opponent.side && aiCooldownRef.current === 0 && nextOpponent.swingState === 'idle') {
            if (match.betweenGames) {
              setMatch((m) => ({ ...m, betweenGames: false, gameOver: false, winner: null, transitionText: null }))
              nextMessage = chooseMessage(nextMessage, `Game ${match.gameNumber} start.`)
            } else if (match.gameOver && !match.matchOver) {
              setMatch((m) => ({ ...m, gameOver: false, winner: null }))
            }
            const serveBall = tossForServe(opponent.side)
            const serveChoice = chooseAIReturnShot(nextOpponent, serveBall, undefined, liveRallyPattern, rallySequence)
            nextBall = serveBall
            nextOpponent = startSwing(nextOpponent, serveChoice.stroke.shot, serveChoice.stroke.family, serveChoice.stroke.hand, serveChoice.stroke.servePattern ?? null, serveChoice.stroke.receivePressure ?? null, serveChoice.context)
            setLiveServePattern(serveChoice.stroke.servePattern ?? null)
            setLiveReceivePressure(null)
            aiCooldownRef.current = 80
            nextMessage = chooseMessage(nextMessage, serveChoice.stroke.servePattern === 'short-spin'
              ? 'Opponent opens with a short spin serve...'
              : serveChoice.stroke.servePattern === 'fast-long'
                ? 'Opponent fires a fast long serve...'
                : 'Opponent serves wide to set up the next ball...')
          }
        }

        if (!serveMode && playerPlan && nextPlayer.swingState === 'idle') {
          nextPlayer = setPlayerTarget(nextPlayer, playerPlan.playerX, playerPlan.playerY, getHandSideForBall(nextPlayer, playerPlan.ball))
        }
        if (oppPlan) {
          nextOpponent = setPlayerTarget(nextOpponent, oppPlan.playerX, oppPlan.playerY, getHandSideForBall(nextOpponent, oppPlan.ball))
        }

        if (isBallHittableForSide(nextBall, opponent.side) && nextOpponent.swingState === 'idle') {
          if (!aiPlanRef.current) {
            const choice = chooseAIReturnShot(nextOpponent, { ...nextBall }, liveServePattern ?? undefined, inferRallyPatternFromShot(lastShot, nextBall), rallySequence)
            const cadence = getCadenceWindow(choice.context, nextOpponent.archetype, choice.stroke.family, choice.stroke.servePattern)
            const commitPhase = choice.context === 'rally'
              ? choice.commitStyle === 'early-take'
                ? (choice.stroke.family === 'attack' || choice.stroke.family === 'block' ? 'early-rise' : cadence.contactPhase)
                : choice.commitStyle === 'late-read'
                  ? (choice.stroke.family === 'cut' ? 'late-fall' : 'peak')
                  : cadence.contactPhase
              : cadence.contactPhase
            const contactPlan = findContactPointForPhase(nextBall, nextOpponent.side, commitPhase, 180, choice.stroke.hand)
            const baseLead = getDecisionLeadTicks(choice.context, nextOpponent.archetype, choice.stroke.servePattern)
            const lateDecision = choice.context === 'rally'
              ? choice.commitStyle === 'early-take'
                ? Math.max(8, baseLead - 4)
                : choice.commitStyle === 'late-read'
                  ? baseLead + 2
                  : baseLead
              : baseLead
            const impactTick = getSwingImpactTick(choice.context, choice.stroke.family)
            const planTicks = Math.max(1, (contactPlan?.etaTicks ?? oppPlan?.etaTicks ?? impactTick) - lateDecision)
            if (contactPlan) {
              nextOpponent = setPlayerTarget(nextOpponent, contactPlan.playerX, contactPlan.playerY, choice.stroke.hand)
            }
            aiPlanRef.current = {
              swingAt: planTicks,
              shot: choice.stroke.shot,
              attack: choice.attack,
              family: choice.stroke.family,
              hand: choice.stroke.hand,
              context: choice.context,
              servePattern: choice.stroke.servePattern,
              thirdBallAttack: choice.thirdBallAttack,
              commitStyle: choice.commitStyle,
              rallyPattern: choice.rallyPattern,
            }
            nextMessage = chooseMessage(nextMessage, choice.context === 'receive'
              ? `Opponent shapes a ${choice.stroke.family} receive${liveServePattern ? ` vs ${liveServePattern}` : ''}...`
              : choice.context === 'opener'
                ? `Opponent eyes a ${choice.stroke.family} opener on the ${cadence.contactPhase.replace('-', ' ')}...`
                : choice.commitStyle === 'early-take'
                  ? `Opponent steps in early for ${choice.rallyPattern} ${choice.stroke.hand} ${choice.stroke.family}...`
                  : choice.commitStyle === 'late-read'
                    ? `Opponent waits on ${choice.rallyPattern} ${choice.stroke.hand} ${choice.stroke.family}...`
                    : choice.attack
                      ? `Opponent lines up ${choice.rallyPattern} ${choice.stroke.hand} ${choice.stroke.family}...`
                      : `Opponent reads ${choice.rallyPattern} ${choice.stroke.hand} ${choice.stroke.family}...`)
          }
          if (aiPlanRef.current) {
            aiPlanRef.current.swingAt -= 1
            if (aiPlanRef.current.swingAt <= 0 && aiCooldownRef.current === 0) {
              nextOpponent = startSwing(nextOpponent, aiPlanRef.current.shot, aiPlanRef.current.family, aiPlanRef.current.hand, aiPlanRef.current.servePattern ?? null, liveReceivePressure, aiPlanRef.current.context)
              aiCooldownRef.current = aiPlanRef.current.context === 'rally'
                ? aiPlanRef.current.commitStyle === 'early-take'
                  ? 56
                  : aiPlanRef.current.commitStyle === 'late-read'
                    ? 70
                    : 63
                : 54
              nextMessage = chooseMessage(nextMessage, aiPlanRef.current.context === 'receive'
                ? `Opponent commits to the ${aiPlanRef.current.family} receive.`
                : aiPlanRef.current.context === 'opener'
                  ? aiPlanRef.current.thirdBallAttack
                    ? 'Opponent jumps the third-ball attack early!'
                    : 'Opponent jumps the first attack phase!'
                  : aiPlanRef.current.commitStyle === 'early-take'
                    ? `Opponent takes ${aiPlanRef.current.rallyPattern} ${aiPlanRef.current.hand} ${aiPlanRef.current.family} early.`
                    : aiPlanRef.current.commitStyle === 'late-read'
                      ? `Opponent hangs back on ${aiPlanRef.current.rallyPattern} ${aiPlanRef.current.hand} ${aiPlanRef.current.family}.`
                      : aiPlanRef.current.attack
                        ? `Opponent commits into ${aiPlanRef.current.rallyPattern} ${aiPlanRef.current.hand} attack!`
                        : `Opponent settles into ${aiPlanRef.current.rallyPattern} ${aiPlanRef.current.hand} ${aiPlanRef.current.family}.`)
              aiPlanRef.current = null
            }
          }
        } else if (!isBallHittableForSide(nextBall, opponent.side)) {
          aiPlanRef.current = null
        }

        nextPlayer = stepPlayer(nextPlayer)
        if (nextPlayer.swingState === 'impact') {
          const impact = resolveImpact(nextPlayer, nextBall, rallySequence)
          nextPlayer = impact.player
          clearQueuedShot = true
          if (impact.madeContact && impact.shot) {
            if (playerContext === 'serve') {
              const serveCheck = analyzeServe(nextBall, impact.shot)
              if (!serveCheck.isLegal) {
                nextBall = createIdleBall()
                aiPlanRef.current = null
                setLiveServePattern(null)
                setLiveReceivePressure(null)
                setServeWindowHint('Fault: serve clipped the net or missed the two-bounce window.')
                playTone(audioRef, audioEnabledRef, 220, 0.09, 'square', 0.02)
                nextMessage = chooseMessage(nextMessage, serveCheck.reason === 'net'
                  ? 'Serve fault — into the net.'
                  : serveCheck.reason === 'long'
                    ? 'Serve fault — long after the first bounce.'
                    : serveCheck.reason === 'wide'
                      ? 'Serve fault — too wide.'
                      : 'Serve fault — wrong bounce order.')
              } else {
                nextBall = applyShot(nextBall, impact.shot)
                nextLastShot = impact.shot
                fxRef.current.flash = 1
                fxRef.current.pulse = 1
                fxRef.current.pulseColor = impact.quality > 0.72 ? '#7ed7ff' : impact.quality < 0.38 ? '#ff8f70' : '#ffe08a'
                playTone(audioRef, audioEnabledRef, impact.quality > 0.72 ? 780 : impact.quality < 0.38 ? 320 : 540, 0.045, 'triangle', 0.018)
                setLiveServePattern(openingPreview.servePattern ?? null)
                setLiveReceivePressure(null)
                setLiveRallyPattern(null)
                nextMessage = chooseMessage(nextMessage, impact.quality > 0.72 && openingPreview.servePattern
                  ? `Clean ${openingPreview.servePattern} serve.`
                  : 'Legal serve in.')
              }
            } else {
              nextBall = applyShot(nextBall, impact.shot)
              nextLastShot = impact.shot
              fxRef.current.flash = 1
              fxRef.current.pulse = 1
              fxRef.current.pulseColor = impact.quality > 0.72 ? '#7ed7ff' : impact.quality < 0.38 ? '#ff8f70' : '#ffe08a'
              playTone(audioRef, audioEnabledRef, impact.quality > 0.72 ? 780 : impact.quality < 0.38 ? 320 : 540, 0.045, 'triangle', 0.018)
              const openingResolved = shouldResolveOpeningPhase(playerContext, nextPlayer.plannedFamily, impact.quality)
              const nextRallyPattern = inferRallyPatternFromShot(impact.shot, nextBall)
              const previousSequence = rallySequence
              let nextSequence = previousSequence
              let tempoShiftMessage: string | null = null
              if (playerContext === 'receive') {
                if (openingResolved) {
                  nextSequence = getNextRallySequenceState(previousSequence, nextRallyPattern)
                  setLiveServePattern(null)
                  setLiveReceivePressure(null)
                  setLiveRallyPattern(nextRallyPattern)
                  setRallySequence(nextSequence)
                  tempoShiftMessage = describeTempoShift(previousSequence, nextSequence, 'you', nextPlayer.archetype)
                  setTempoBadge(getTempoBadge(nextSequence))
                } else {
                  setLiveServePattern(null)
                  setLiveReceivePressure(openingPreview.receivePressure ?? null)
                  setLiveRallyPattern(null)
                  setTempoBadge(null)
                }
              } else if (playerContext === 'rally') {
                nextSequence = getNextRallySequenceState(previousSequence, nextRallyPattern)
                setLiveRallyPattern(nextRallyPattern)
                setRallySequence(nextSequence)
                tempoShiftMessage = describeTempoShift(previousSequence, nextSequence, 'you', nextPlayer.archetype)
                setTempoBadge(getTempoBadge(nextSequence))
              }
              nextMessage = chooseMessage(nextMessage, openingResolved && playerContext !== 'rally'
                ? playerContext === 'receive'
                  ? 'Receive phase stabilizes into open rally.'
                  : 'First attack lands — rally opens up.'
                : tempoShiftMessage
                  ? tempoShiftMessage
                  : describeTempoContact(
                      'you',
                      nextPlayer.archetype,
                      nextSequence,
                      impact.quality,
                      impact.timingError,
                      player.plannedContext,
                      player.plannedFamily,
                      player.plannedReceivePressure,
                      playerStatusRatio,
                    ))
            }
          } else {
            nextMessage = chooseMessage(nextMessage, playerStatusRatio < 0.3 ? 'Too drained — missed contact.' : 'Missed contact — get into position first.')
          }
        }

        nextOpponent = stepPlayer(nextOpponent)
        if (nextOpponent.swingState === 'impact') {
          const impact = resolveImpact(nextOpponent, nextBall, rallySequence)
          nextOpponent = impact.player
          if (impact.madeContact && impact.shot) {
            if (nextOpponent.plannedContext === 'serve') {
              const serveCheck = analyzeServe(nextBall, impact.shot)
              if (!serveCheck.isLegal) {
                nextBall = createIdleBall()
                setLiveServePattern(null)
                setLiveReceivePressure(null)
                nextMessage = chooseMessage(nextMessage, serveCheck.reason === 'net'
                  ? 'Opponent faults the serve into the net.'
                  : serveCheck.reason === 'long'
                    ? 'Opponent serves long — fault.'
                    : serveCheck.reason === 'wide'
                      ? 'Opponent misses the sideline on serve.'
                      : 'Opponent serve fault.')
                playTone(audioRef, audioEnabledRef, 210, 0.09, 'square', 0.02)
              } else {
                nextBall = applyShot(nextBall, impact.shot)
                fxRef.current.flash = 1
                fxRef.current.pulse = 1
                fxRef.current.pulseColor = impact.quality > 0.72 ? '#ffd46d' : impact.quality < 0.38 ? '#ff8f70' : '#ffe08a'
                playTone(audioRef, audioEnabledRef, impact.quality > 0.72 ? 700 : impact.quality < 0.38 ? 280 : 500, 0.045, 'square', 0.014)
                setLiveServePattern(nextOpponent.plannedServePattern ?? null)
                setLiveReceivePressure(null)
                setLiveRallyPattern(null)
                nextMessage = chooseMessage(nextMessage, impact.quality > 0.72 && nextOpponent.plannedServePattern
                  ? `Opponent lands a ${nextOpponent.plannedServePattern} serve.`
                  : 'Opponent gets a legal serve in.')
              }
            } else {
              nextBall = applyShot(nextBall, impact.shot)
              fxRef.current.flash = 1
              fxRef.current.pulse = 1
              fxRef.current.pulseColor = impact.quality > 0.72 ? '#ffd46d' : impact.quality < 0.38 ? '#ff8f70' : '#ffe08a'
              playTone(audioRef, audioEnabledRef, impact.quality > 0.72 ? 700 : impact.quality < 0.38 ? 280 : 500, 0.045, 'square', 0.014)
              const openingResolved = shouldResolveOpeningPhase(nextOpponent.plannedContext, nextOpponent.plannedFamily, impact.quality)
              const nextRallyPattern = inferRallyPatternFromShot(impact.shot, nextBall)
              const previousSequence = rallySequence
              let nextSequence = previousSequence
              let tempoShiftMessage: string | null = null
              if (nextOpponent.plannedContext === 'receive') {
                if (openingResolved) {
                  nextSequence = getNextRallySequenceState(previousSequence, nextRallyPattern)
                  setLiveServePattern(null)
                  setLiveReceivePressure(null)
                  setLiveRallyPattern(nextRallyPattern)
                  setRallySequence(nextSequence)
                  tempoShiftMessage = describeTempoShift(previousSequence, nextSequence, 'opp', nextOpponent.archetype)
                  setTempoBadge(getTempoBadge(nextSequence))
                } else {
                  setLiveServePattern(null)
                  setLiveReceivePressure(choicePressure(nextOpponent.plannedFamily, liveServePattern))
                  setLiveRallyPattern(null)
                  setTempoBadge(null)
                }
              } else if (nextOpponent.plannedContext === 'rally') {
                nextSequence = getNextRallySequenceState(previousSequence, nextRallyPattern)
                setLiveRallyPattern(nextRallyPattern)
                setRallySequence(nextSequence)
                tempoShiftMessage = describeTempoShift(previousSequence, nextSequence, 'opp', nextOpponent.archetype)
                setTempoBadge(getTempoBadge(nextSequence))
              }
              nextMessage = chooseMessage(nextMessage, openingResolved && nextOpponent.plannedContext !== 'rally'
                ? nextOpponent.plannedContext === 'receive'
                  ? 'Opponent settles the receive and the rally opens.'
                  : 'Opponent lands the first attack and opens the rally.'
                : tempoShiftMessage
                  ? tempoShiftMessage
                  : describeTempoContact(
                      'opp',
                      nextOpponent.archetype,
                      nextSequence,
                      impact.quality,
                      impact.timingError,
                      nextOpponent.plannedContext,
                      nextOpponent.plannedFamily,
                      nextOpponent.plannedReceivePressure,
                      getStatusRatio(nextOpponent),
                    ))
            }
          } else {
            aiPlanRef.current = null
          }
        }
      }

      if (prevBall.status >= 0 && nextBall.status >= 0 && prevBall.status !== nextBall.status && (nextBall.status === 0 || nextBall.status === 1 || nextBall.status === 2 || nextBall.status === 3)) {
        fxRef.current.bounce = 1
        playTone(audioRef, audioEnabledRef, 240, 0.035, 'sine', 0.012)
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
    const impactColor = new THREE.Color('#7ed7ff')

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

    const impactFlash = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.08, 32), new THREE.MeshBasicMaterial({ color: 0x7ed7ff, transparent: true, opacity: 0, side: THREE.DoubleSide }))
    impactFlash.rotation.x = -Math.PI / 2
    impactFlash.visible = false
    scene.add(impactFlash)

    const bounceFlash = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.06, 32), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, side: THREE.DoubleSide }))
    bounceFlash.rotation.x = -Math.PI / 2
    bounceFlash.visible = false
    scene.add(bounceFlash)

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
      fxRef.current.flash = Math.max(0, fxRef.current.flash - 0.06)
      fxRef.current.pulse = Math.max(0, fxRef.current.pulse - 0.045)
      fxRef.current.bounce = Math.max(0, fxRef.current.bounce - 0.08)

      ballMesh.position.set(ball.x, ball.y, ball.z)
      shadow.position.set(ball.x, ball.y, 0.001)
      shadow.scale.setScalar(1 + Math.max(0, ball.z - TABLE.height) * 0.35 + fxRef.current.bounce * 0.45)
      ;(ballMesh.material as THREE.MeshStandardMaterial).emissive.setRGB(0.27 + fxRef.current.flash * 0.35, 0.13 + fxRef.current.flash * 0.2, 0.0)
      ballMesh.scale.setScalar(1 + fxRef.current.flash * 0.22)

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

      if (fxRef.current.pulse > 0) {
        impactFlash.visible = true
        impactFlash.position.set(ball.x, ball.y, TABLE.height + 0.008)
        impactFlash.scale.setScalar(1 + fxRef.current.pulse * 2.6)
        ;(impactFlash.material as THREE.MeshBasicMaterial).opacity = fxRef.current.pulse * 0.42
        ;(impactFlash.material as THREE.MeshBasicMaterial).color.set(fxRef.current.pulseColor)
      } else {
        impactFlash.visible = false
      }

      if (fxRef.current.bounce > 0) {
        bounceFlash.visible = true
        bounceFlash.position.set(ball.x, ball.y, TABLE.height + 0.006)
        bounceFlash.scale.setScalar(1 + fxRef.current.bounce * 2.2)
        ;(bounceFlash.material as THREE.MeshBasicMaterial).opacity = fxRef.current.bounce * 0.32
      } else {
        bounceFlash.visible = false
      }
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
    if (showMenu) {
      setShowMenu(false)
      setMenuCollapsed(true)
      setMessage('Match started. Aim, then hold/release to swing.')
      return
    }
    if (match.matchOver) {
      setMessage(`Match over — ${match.matchWinner === 'you' ? 'you win' : 'opponent wins'}. Reset to play again.`)
      return
    }
    if (match.betweenGames && ball.status === 8) {
      setMatch((m) => ({ ...m, betweenGames: false, gameOver: false, winner: null, transitionText: null }))
      setMessage(`Game ${match.gameNumber} start — ${player.side > 0 ? 'south' : 'north'} end.`)
    } else if (match.gameOver && ball.status === 8) {
      setMatch((m) => ({ ...m, gameOver: false, winner: null }))
    }
    if (ball.status === 8 && !isYourServe) {
      setMessage('Waiting for opponent serve.')
      return
    }
    if (!effectiveServeMode && !isBallHittableForSide(ball, player.side) && ball.status !== 8) {
      setMessage('Ball not on your side yet.')
      return
    }

    const baseBall = effectiveServeMode
      ? tossForServe(player.side)
      : ball.status === 8 ? createNeutralBallForSide(player.side) : { ...ball }

    const plannedContext = detectStrokeContext(playerRef.current, baseBall)
    const stroke = assistOpeningBias
      ? plannedContext !== 'rally'
        ? buildOpeningStrokePlan(playerRef.current, baseBall, target.x, target.y, plannedContext, liveServePattern ?? undefined)
        : buildRallyStrokePlan(playerRef.current, baseBall, target.x, target.y, liveRallyPattern, rallySequence)
      : effectiveServeMode
        ? buildStrokePlan(playerRef.current, baseBall, target.x, target.y, nextLevel, spin, true)
        : buildStrokePlan(playerRef.current, baseBall, target.x, target.y, nextLevel, spin)

    if (plannedContext === 'serve') {
      setServeWindowHint(
        stroke.servePattern === 'short-spin'
          ? 'Serve window: keep the second bounce short and central.'
          : stroke.servePattern === 'fast-long'
            ? 'Serve window: drive deep through the middle lanes.'
            : 'Serve window: keep the wide setup legal, not too close to the sideline.',
      )
    } else {
      setServeWindowHint(null)
    }

    if (match.gameOver && ball.status === 8) {
      setMessage(`Next game ready — you are now on the ${player.side > 0 ? 'south' : 'north'} end.`)
    }

    const nextPlayer = startSwing(playerRef.current, stroke.shot, stroke.family, stroke.hand, stroke.servePattern ?? null, stroke.receivePressure ?? null, plannedContext)
    playerRef.current = nextPlayer
    ballRef.current = baseBall
    setShotQueued(stroke.shot)
    setPlayer(nextPlayer)
    setBall(baseBall)
    setMessage(
      plannedContext !== 'rally'
        ? `Swing started — ${plannedContext} ${stroke.hand} ${stroke.family}.`
        : effectiveServeMode
          ? 'Serve swing started — move through it.'
          : `Swing started — ${stroke.hand} ${stroke.family}.`,
    )
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
    setMatch({
      server: 'you',
      servesUsed: 0,
      gameOver: false,
      winner: null,
      games: { you: 0, opp: 0 },
      gameNumber: 1,
      matchOver: false,
      matchWinner: null,
      sidesSwapped: false,
      deciderSwitchDone: false,
      betweenGames: false,
      transitionText: null,
    })
    setLastShot(null)
    setLiveRallyPattern(null)
    setRallySequence({ latest: null, dominant: null, streak: 0 })
    setTempoBadge(null)
    setShotQueued(null)
    setLiveServePattern(null)
    setLiveReceivePressure(null)
    setServeWindowHint(null)
    setShowMenu(true)
    setMenuCollapsed(false)
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

      {!menuCollapsed && (
        <div style={{ position: 'absolute', inset: '16px 16px auto 16px', padding: 18, background: 'rgba(0,0,0,0.72)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.14)', zIndex: 6, maxWidth: 560 }}>
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Cannon Smash Web Prototype</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.92, marginBottom: 12 }}>
            Faithful-ish mobile-friendly remake prototype with source-inspired ball sim, serve/receive/opening logic, archetype styles, and early match flow.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, lineHeight: 1.5, opacity: 0.92 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Controls</div>
              <div>• drag to aim</div>
              <div>• hold/release to swing</div>
              <div>• opening bias can assist serve/receive phases</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Match</div>
              <div>• best of five games</div>
              <div>• ends switch each game</div>
              <div>• deciding game switches ends mid-game</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => { setShowMenu(false); setMenuCollapsed(true); setMessage('Match started. Aim, then hold/release to swing.') }} style={btn}>Start match</button>
            <button onClick={() => setMenuCollapsed((v) => !v)} style={btnGhost}>{menuCollapsed ? 'Show panel' : 'Hide panel'}</button>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', top: 16, left: 16, padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12, minWidth: compactHud ? 220 : 290, maxWidth: compactHud ? 260 : 340, boxShadow: fxRef.current.flash > 0 ? `0 0 ${18 + fxRef.current.flash * 22}px rgba(126,215,255,${0.18 + fxRef.current.flash * 0.22})` : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Cannon Smash Rally Prototype</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>{compactHud ? 'Match HUD' : 'Swing timing + opening play + multi-game match loop.'}</div>
          </div>
          <button onClick={() => setShowDebugHud((v) => !v)} style={{ ...btnGhost, padding: '6px 8px', fontSize: 12 }}>{showDebugHud ? 'Less' : 'More'}</button>
        </div>
        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          <div>games: you {match.games.you} — {match.games.opp} opp</div>
          <div>game {match.gameNumber} · {score.you}-{score.opp}</div>
          <div>serve: {isYourServe ? 'you' : 'opp'} {match.matchOver ? '· match over' : match.gameOver ? '· game over' : ''}</div>
          <div>end: {player.side > 0 ? 'south' : 'north'}{match.games.you === 2 && match.games.opp === 2 ? ' · decider' : ''}</div>
          <div>you: {player.archetype} · {(playerStatusRatio * 100).toFixed(0)}%</div>
          <div>opp: {opponent.archetype} · {(oppStatusRatio * 100).toFixed(0)}%</div>
          <div>phase: {playerContext}</div>
          <div>{message}</div>
          {tempoBadge && <div style={{ opacity: 0.82 }}>{tempoBadge}</div>}
          {serveWindowHint && <div style={{ opacity: 0.82 }}>hint: {serveWindowHint}</div>}
          {showDebugHud && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <div>ball status: {ball.status}</div>
              <div>opening bias: {assistOpeningBias ? 'on' : 'off'}</div>
              <div>serve plan: {liveServePattern ?? openingPreview.servePattern ?? 'none'}</div>
              <div>receive pressure: {liveReceivePressure ?? openingPreview.receivePressure ?? 'none'}</div>
              <div>rally pattern: {playerContext === 'rally' ? rallyPreview.rallyPattern : liveRallyPattern ?? 'none'}</div>
              <div>rally seq: {rallySequence.dominant ?? 'none'} · {rallySequence.streak}</div>
              <div>tempo read: {getTempoRead(rallySequence)}</div>
              <div>opening active: {playerContext === 'receive' || playerContext === 'opener' ? 'yes' : 'no'}</div>
              <div>your pos: {player.x.toFixed(2)}, {player.y.toFixed(2)} · stance {playerHand}</div>
              <div>your reach: {playerContact.distance.toFixed(2)} {playerContact.reachable ? '✓' : '×'}</div>
              <div>your swing: {player.swingState} @ {player.swingTimer} · {player.plannedHand} {player.plannedFamily}</div>
              <div>your pressure: {player.plannedReceivePressure ?? 'none'}</div>
              <div>opp swing: {opponent.swingState} @ {opponent.swingTimer} · {opponent.plannedHand} {opponent.plannedFamily}</div>
              <div>opp pressure: {opponent.plannedReceivePressure ?? 'none'}</div>
              <div>opp plan: {aiPlanRef.current?.context ?? 'idle'}{aiPlanRef.current ? ` · ${aiPlanRef.current.rallyPattern} · ${aiPlanRef.current.family} · ${aiPlanRef.current.commitStyle}` : ''}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 16, right: 16, width: compactHud ? 272 : 304, padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Aim / stroke</div>
          <button onClick={() => setMenuCollapsed((v) => !v)} style={{ ...btnGhost, padding: '6px 8px', fontSize: 12 }}>{menuCollapsed ? 'Menu' : 'Hide'}</button>
        </div>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
          <input type="checkbox" checked={assistOpeningBias} onChange={(e) => setAssistOpeningBias(e.target.checked)} />
          Bias player openings by phase
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 }}>
          <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
          Simple sound hooks
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onPointerDown={pointerDownSwing} onPointerUp={pointerUpSwing} onPointerCancel={pointerUpSwing} style={btn}>{showMenu ? 'Start match' : 'Hold / release swing'}</button>
          <button onClick={resetIdle} style={btnGhost}>{match.matchOver ? 'New match' : 'Reset'}</button>
          <button onClick={() => setRunning((v) => !v)} style={btnGhost}>{running ? 'Pause' : 'Resume'}</button>
        </div>
        {shotQueued && <div style={{ fontSize: 12, marginTop: 10, opacity: 0.9 }}>queued impact shot ready</div>}
        {ball.status === 8 && <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>
          {showMenu
            ? 'open menu — press start match'
            : match.matchOver
              ? 'match complete'
              : match.betweenGames
                ? 'between games — swing to continue'
                : isYourServe
                  ? 'ready to serve'
                  : 'waiting for opponent serve'}
        </div>}
        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, opacity: 0.92 }}>
          phase: {playerContext}<br />
          serve: {liveServePattern ?? openingPreview.servePattern ?? '—'}<br />
          suggested: {playerContext === 'rally' ? `${rallyPreview.hand} ${rallyPreview.family}` : `${openingPreview.hand} ${openingPreview.family}`}
          {playerContext !== 'rally' ? <><br />opening read: {openingPreview.family} via {openingPreview.hand}</> : null}
          {playerContext === 'opener' ? <><br />opener shape: {openingPreview.family === 'attack' ? 'flatter / faster' : openingPreview.family === 'cut' ? 'spinnier / safer' : openingPreview.family === 'block' ? 'compact / higher margin' : 'steady topspin'}</> : null}
          {playerContext === 'rally' ? <><br />rally read: {rallyPreview.rallyPattern === 'pressure' ? 'apply pressure / look to finish from shape' : rallyPreview.rallyPattern === 'reset' ? 'reset or roll safe to reopen later' : 'counter off the incoming pace'}<br />rally commit: {rallyPreview.commitStyle}<br />rally family: {rallyPreview.family}</> : null}
          {serveWindowHint ? <><br />hint: {serveWindowHint}</> : null}
          {(ball.status === 8 && isYourServe) ? <><br />serve faults now check net / long / wide / wrong-bounce.</> : null}
        </div>
        {showDebugHud && (
          <>
            <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, opacity: 0.92 }}>
              receive pressure: {liveReceivePressure ?? openingPreview.receivePressure ?? '—'}<br />
              manual: {defaultPreview.hand} {defaultPreview.family}
              {playerContext === 'rally' ? <><br />assist rally: {rallyPreview.rallyPattern} · {rallyPreview.family} · {rallyPreview.commitStyle}<br />sequence: {rallySequence.dominant ?? 'none'} · {rallySequence.streak}<br />tempo: {getTempoRead(rallySequence)}</> : null}
            </div>
            {contactPrediction && <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>assist intercept in {(contactPrediction.etaTicks * TICK).toFixed(2)}s</div>}
            {opponentPrediction && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.75 }}>opp intercept in {(opponentPrediction.etaTicks * TICK).toFixed(2)}s</div>}
            {aiPlanRef.current && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.75 }}>opp swing commit in {(Math.max(0, aiPlanRef.current.swingAt) * TICK).toFixed(2)}s · {aiPlanRef.current.context} · {aiPlanRef.current.rallyPattern} · {aiPlanRef.current.family} · {aiPlanRef.current.commitStyle}</div>}
            {lastShot && <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, opacity: 0.9 }}>last shot: ({lastShot.vx.toFixed(2)}, {lastShot.vy.toFixed(2)}, {lastShot.vz.toFixed(2)}) · {inferRallyPatternFromShot(lastShot, ball) ?? '—'}</div>}
          </>
        )}
      </div>

      {match.transitionText && !match.matchOver && !showMenu && (
        <div style={{ position: 'absolute', inset: '28% 24px auto 24px', padding: 18, background: 'rgba(0,0,0,0.68)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.14)', textAlign: 'center', zIndex: 5 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{match.winner === 'you' ? 'Game won' : 'Game lost'}</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.92 }}>{match.transitionText}</div>
        </div>
      )}

      <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px', display: 'grid', gridTemplateColumns: compactHud ? '1fr' : '1fr 1fr', gap: 12 }}>
        <TouchPad label={compactHud ? 'Aim' : 'Drag-to-aim'} onChange={(v) => setTarget({ x: v.x * (TABLE.width / 2 - 0.08), y: ((v.y + 1) / 2) * (TABLE.length / 2 - 0.14) + 0.07 })} compact={compactHud} />
        <div style={{ padding: 12, background: 'rgba(0,0,0,0.45)', borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
            The HUD is lighter on mobile now too: key match info stays visible up front, deeper diagnostics tuck behind a More/Less toggle, and the touch pad compacts on smaller screens.
          </div>
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: 0, background: '#7ed7ff', color: '#00131a', fontWeight: 700 }
const btnGhost: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: 'white', fontWeight: 700 }
const selectStyle: React.CSSProperties = { width: '100%', marginTop: 4, borderRadius: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.14)' }

function matchPointMessage(
  score: { you: number; opp: number },
  games: { you: number; opp: number },
  oppWon: boolean,
  matchOver: boolean,
  switchedEndsMidGame: boolean,
): string {
  const gameOver = (score.you >= 11 || score.opp >= 11) && Math.abs(score.you - score.opp) >= 2
  if (matchOver) return oppWon ? 'Match to opponent.' : 'Match to you.'
  if (gameOver) return oppWon ? `Game to opponent. Games ${games.you}-${games.opp}. Ends switch.` : `Game to you. Games ${games.you}-${games.opp}. Ends switch.`
  if (switchedEndsMidGame) return oppWon ? 'Point to opponent. Decider ends switch.' : 'Point to you. Decider ends switch.'
  return oppWon ? 'Point to opponent.' : 'Point to you.'
}

function buildBetweenGameMessage(
  youWonGame: boolean,
  games: { you: number; opp: number },
  nextGameNumber: number,
  sidesSwapped: boolean,
  nextIsDecider: boolean,
): string {
  const endText = sidesSwapped ? 'north' : 'south'
  const deciderText = nextIsDecider ? ' Deciding game next.' : ''
  return `${youWonGame ? 'You take the game.' : 'Opponent takes the game.'} Games ${games.you}-${games.opp}. Next: game ${nextGameNumber}, you start on the ${endText} end.${deciderText} Swing to continue.`
}

function TouchPad({ label, onChange, compact = false }: { label: string; onChange: (v: Vec2) => void; compact?: boolean }) {
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
      style={{ position: 'relative', minHeight: compact ? 116 : 140, background: 'rgba(0,0,0,0.45)', borderRadius: 12, touchAction: 'none', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: 12, left: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: compact ? 92 : 110, height: compact ? 92 : 110, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: `calc(50% + ${local.x * (compact ? 32 : 40)}px - 14px)`, top: `calc(50% - ${local.y * (compact ? 32 : 40)}px - 14px)`, width: 28, height: 28, borderRadius: '50%', background: '#7ed7ff' }} />
        </div>
      </div>
    </div>
  )
}

function choicePressure(family: ShotFamily, servePattern: ServePattern | null): ReceivePressure {
  if (servePattern === 'short-spin') return family === 'cut' || family === 'block' ? 'high' : 'medium'
  if (servePattern === 'wide-setup') return family === 'attack' ? 'medium' : 'high'
  return family === 'attack' ? 'low' : 'medium'
}

function playTone(
  audioRef: React.MutableRefObject<AudioContext | null>,
  enabledRef: React.MutableRefObject<boolean>,
  frequency: number,
  duration: number,
  type: OscillatorType,
  gainValue: number,
) {
  if (!enabledRef.current || typeof window === 'undefined') return
  const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtor) return
  if (!audioRef.current) audioRef.current = new AudioCtor()
  const ctx = audioRef.current
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(gainValue, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}
