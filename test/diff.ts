import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'
for (const d of [0,1,2]) {
  let wins = 0
  for (let m = 0; m < 8; m++) {
    const g = makeGame(); startMatch(g, d)
    for (let i = 0; i < 600000; i++) {
      if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8)
        applySwipe(g, { aimX: (Math.random()-0.5)*0.8, power: 0.55+Math.random()*0.3, spin: 0.3 })
      const st = g.ball.status
      if (g.phase === 'rally' && (st===2||st===5) && !g.pending.active && g.ball.vy<0 && g.ball.y<0.4)
        applySwipe(g, { aimX: (Math.random()-0.5)*1.2, power: 0.5+Math.random()*0.4, spin: Math.random()>0.4?0.6:-0.5 })
      tickGame(g)
      if (g.phase === 'matchover') break
    }
    if (g.youWonMatch) wins++
  }
  console.log(`difficulty ${d}: bot won ${wins}/8`)
}
