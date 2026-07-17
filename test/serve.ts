import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'
for (const power of [0.2, 0.35, 0.5, 0.65, 0.8, 1.0]) {
  for (const aimX of [-0.8, 0, 0.8]) {
    for (const spin of [-0.8, 0, 0.8]) {
      const g = makeGame(); startMatch(g, 1)
      applySwipe(g, { aimX, power, spin })
      let result = 'timeout'
      for (let i = 0; i < 3000; i++) {
        tickGame(g)
        if (g.phase === 'point' || g.phase === 'gameover') { result = g.msg + ` ${g.points.you}-${g.points.cpu}`; break }
        if (g.ball.status === 1) { result = 'LANDED ok'; break }
      }
      console.log(`power=${power} aim=${aimX} spin=${spin}: ${result}`)
    }
  }
}
