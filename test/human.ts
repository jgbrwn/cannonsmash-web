// Simulate a sloppier human: variable swipe timing, occasional missed swipes.
import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'
for (const d of [0,1,2]) {
  let wins = 0, totP = 0, totC = 0
  for (let m = 0; m < 6; m++) {
    const g = makeGame(); startMatch(g, d)
    let threshold = 0.4
    for (let i = 0; i < 600000; i++) {
      if (i % 7 === 0) {
        if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8)
          applySwipe(g, { aimX: (Math.random()-0.5)*0.8, power: 0.4+Math.random()*0.5, spin: Math.random()*0.8-0.2 })
        const st = g.ball.status
        if (g.phase === 'rally' && (st===2||st===5) && !g.pending.active && g.ball.vy<0 && g.ball.y<threshold) {
          if (Math.random() < 0.94) // sometimes fails to react at all
            applySwipe(g, { aimX: (Math.random()-0.5)*1.4, power: 0.35+Math.random()*0.55, spin: Math.random()>0.35?0.5:-0.5 })
          threshold = -0.8 + Math.random()*2.2 // varies from very early to late
        }
      }
      tickGame(g)
      if (g.phase === 'matchover') break
    }
    totP += g.games.you; totC += g.games.cpu
    if (g.youWonMatch) wins++
  }
  console.log(`difficulty ${d}: won ${wins}/6 matches, games ${totP}-${totC}`)
}
