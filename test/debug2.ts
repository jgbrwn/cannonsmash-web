import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'
const g = makeGame()
startMatch(g, 1)
let cpuStrikes = 0, cpuSwings = 0
// monkeypatch Math.random? simpler: count events
for (let i = 0; i < 100000; i++) {
  if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8) applySwipe(g, { aimX: 0, power: 0.6, spin: 0.3 })
  const st = g.ball.status
  if (g.phase === 'rally' && (st === 2 || st === 5) && !g.pending.active && g.ball.vy < 0 && g.ball.y < 0.4)
    applySwipe(g, { aimX: 0.3, power: 0.7, spin: 0.5 })
  const preSwing = g.cpu.swingT
  tickGame(g)
  if (g.cpu.swingT === 1 && preSwing === 0) cpuSwings++
  if ((g.events & 1) && g.lastHitter === -1) cpuStrikes++
  if (g.phase === 'point') { console.log('point at', g.tick, g.msg, g.points); break }
}
console.log('cpu swings', cpuSwings, 'strikes', cpuStrikes)
