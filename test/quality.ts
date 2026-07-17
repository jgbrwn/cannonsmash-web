import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'
// emulate browser bot timing: poll every 5 ticks, swipe when ball.y<0.4 coming to you
const g = makeGame(); startMatch(g, 1)
let outs = 0, nets = 0, wins = 0, misses = 0, faults = 0
for (let i = 0; i < 200000; i++) {
  if (i % 5 === 0) {
    if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8)
      applySwipe(g, { aimX: (Math.random()-0.5)*0.7, power: 0.55+Math.random()*0.3, spin: 0.3 })
    const st = g.ball.status
    if (g.phase === 'rally' && (st===2||st===5) && !g.pending.active && g.ball.vy<0 && g.ball.y<0.4)
      applySwipe(g, { aimX: (Math.random()-0.5)*1.2, power: 0.5+Math.random()*0.4, spin: 0.5 })
  }
  const pre = g.phase
  tickGame(g)
  if (pre === 'rally' && (g.phase === 'point' || g.phase==='gameover'||g.phase==='matchover')) {
    if (g.msg.includes('Out')) outs++
    else if (g.msg.includes('net') && g.msg.includes('Into')) nets++
    else if (g.msg.includes('Missed')) misses++
    else if (g.msg.includes('fault')) faults++
    else wins++
  }
  if (g.phase === 'matchover') break
}
console.log({points:g.points, games:g.games, outs, nets, misses, faults, wins})
