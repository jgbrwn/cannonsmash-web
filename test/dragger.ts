// Sim that also drags to position (like a real player using the new controls)
import { makeGame, startMatch, tickGame, applySwipe, beginDrag, updateDrag, endDrag } from '../src/game'
for (const d of [0,1,2]) {
  let wins = 0, gp = 0, gc = 0
  for (let m = 0; m < 6; m++) {
    const g = makeGame(); startMatch(g, d)
    for (let i = 0; i < 600000; i++) {
      if (i % 7 === 0) {
        if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8)
          applySwipe(g, { aimX: (Math.random()-0.5)*0.8, power: 0.4+Math.random()*0.4, spin: 0.3 })
        const st = g.ball.status
        if (g.phase === 'rally') {
          // drag toward predicted contact (simulates finger positioning, imperfect)
          if (g.contactYou.valid && Math.abs(g.contactYou.x - g.you.x) > 0.15 && !g.dragging) {
            beginDrag(g)
            updateDrag(g, (g.contactYou.x - g.you.x + (Math.random()-0.5)*0.15) / (1.525*2.2))
          }
          if ((st===2||st===5) && !g.pending.active && g.ball.vy<0 && g.ball.y < 0.2+Math.random()*1.2) {
            if (g.dragging) endDrag(g)
            if (Math.random() < 0.94)
              applySwipe(g, { aimX: (Math.random()-0.5)*1.4, power: 0.35+Math.random()*0.5, spin: Math.random()>0.35?0.5:-0.5 })
          }
        }
      }
      tickGame(g)
      if (g.phase === 'matchover') break
    }
    gp += g.games.you; gc += g.games.cpu
    if (g.youWonMatch) wins++
  }
  console.log(`difficulty ${d}: won ${wins}/6, games ${gp}-${gc}`)
}
