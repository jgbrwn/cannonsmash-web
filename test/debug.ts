import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'

const g = makeGame()
startMatch(g, 1)
let log: string[] = []
for (let i = 0; i < 12000; i++) {
  if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8) {
    applySwipe(g, { aimX: 0, power: 0.6, spin: 0.3 })
  }
  const st = g.ball.status
  if (g.phase === 'rally' && (st === 2 || st === 5) && !g.pending.active && g.ball.vy < 0 && g.ball.y < 0.4) {
    applySwipe(g, { aimX: 0, power: 0.6, spin: 0.5 })
  }
  const prevPhase = g.phase
  const prevSt = g.ball.status
  tickGame(g)
  if (g.events & 1) log.push(`t${g.tick} HIT by ${g.lastHitter===1?'you':'cpu'} ball(${g.ball.x.toFixed(2)},${g.ball.y.toFixed(2)},${g.ball.z.toFixed(2)}) v(${g.ball.vx.toFixed(1)},${g.ball.vy.toFixed(1)},${g.ball.vz.toFixed(1)}) st=${g.ball.status}`)
  if (prevSt !== g.ball.status && g.ball.status >= 0) log.push(`t${g.tick} status ${prevSt}->${g.ball.status} y=${g.ball.y.toFixed(2)} z=${g.ball.z.toFixed(2)}`)
  if (prevPhase === 'rally' && g.phase === 'point') log.push(`t${g.tick} POINT ${g.msg} score ${g.points.you}-${g.points.cpu}`)
  if (g.points.you + g.points.cpu >= 3) break
}
console.log(log.join('\n'))
