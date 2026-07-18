import { makeGame, startMatch, tickGame, applySwipe, beginDrag, updateDrag, endDrag } from '../src/game'
const g = makeGame(); startMatch(g, 1)
let misses = 0, hits = 0, outcomes: Record<string, number> = {}
for (let i = 0; i < 120000; i++) {
  if (i % 5 === 0) {
    if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8)
      applySwipe(g, { aimX: (Math.random()-0.5)*0.6, power: 0.6, spin: 0.4 })
    const st = g.ball.status
    if (g.phase === 'rally' && (st===2||st===5) && !g.pending.active && g.ball.vy<0 && g.ball.y<0.8)
      applySwipe(g, { aimX: (Math.random()-0.5)*1.0, power: 0.55, spin: 0.5 })
  }
  const pre = g.phase
  tickGame(g)
  if ((g.events & 1) && g.lastHitter === 1) hits++
  if (pre === 'rally' && g.phase !== 'rally' && g.phase !== 'serve') {
    outcomes[g.msg] = (outcomes[g.msg]||0)+1
  }
  if (g.phase === 'matchover') break
}
console.log({points:g.points, games:g.games, hits, outcomes})
