// Headless simulator: exercises serve + rally logic to validate playability.
import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'

const g = makeGame()
startMatch(g, 1)

let served = 0, rallies = 0, yourPoints = 0, cpuPoints = 0
let swipeQueuedAt = -1

function maybeAct() {
  // your serve: swipe as soon as phase is serve
  if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8) {
    applySwipe(g, { aimX: (Math.random() - 0.5) * 0.8, power: 0.55 + Math.random() * 0.3, spin: 0.3 })
    served++
  }
  // rally: when ball is coming to you and hittable soon, swipe once
  const st = g.ball.status
  if (g.phase === 'rally' && (st === 2 || st === 5 || st === 3) && !g.pending.active && g.ball.vy < 0) {
    // swipe when ball crosses net toward you
    if (g.ball.y < 0.4 && swipeQueuedAt < g.tick - 30) {
      applySwipe(g, { aimX: (Math.random() - 0.5) * 1.2, power: 0.5 + Math.random() * 0.4, spin: Math.random() > 0.4 ? 0.6 : -0.5 })
      swipeQueuedAt = g.tick
    }
  }
}

let lastPts = 0
let hitsBy = { you: 0, cpu: 0 }
let prevHitter = 0
for (let i = 0; i < 400000; i++) {
  maybeAct()
  tickGame(g)
  if (g.events & 1) {
    if (g.lastHitter === 1) hitsBy.you++
    else hitsBy.cpu++
  }
  const tot = g.points.you + g.points.cpu + (g.games.you + g.games.cpu) * 100
  if (tot !== lastPts) { lastPts = tot }
  if (g.phase === 'matchover') break
}
console.log('phase', g.phase, 'points', g.points, 'games', g.games, 'serves', served, 'hits', hitsBy, 'ticks', g.tick)
