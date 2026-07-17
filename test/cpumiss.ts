import { makeGame, startMatch, tickGame, applySwipe } from '../src/game'

const g = makeGame()
startMatch(g, 1)
let lastCpuState = ''
for (let i = 0; i < 12000; i++) {
  if (g.phase === 'serve' && g.server === 1 && g.ball.status === 8) applySwipe(g, { aimX: 0, power: 0.6, spin: 0.3 })
  const st = g.ball.status
  if (g.phase === 'rally' && (st === 2 || st === 5) && !g.pending.active && g.ball.vy < 0 && g.ball.y < 0.4)
    applySwipe(g, { aimX: 0.9, power: 0.9, spin: 0.6 })
  const preSt = g.ball.status
  tickGame(g)
  if (preSt === 1) {
    lastCpuState = `st1 t${g.tick} ball(${g.ball.x.toFixed(2)},${g.ball.y.toFixed(2)},${g.ball.z.toFixed(2)}) cpu(${g.cpu.x.toFixed(2)},${g.cpu.y.toFixed(2)}) plan=${g.cpuPlan.active} swingAt=${g.cpuPlan.swingAt} contactValid=${g.contactCpu.valid} cticks=${g.contactCpu.ticks} c=(${g.contactCpu.x.toFixed(2)},${g.contactCpu.y.toFixed(2)},${g.contactCpu.z.toFixed(2)})`
  }
  if (g.phase === 'point' && g.msg === 'Winner!') { console.log('CPU MISS:', lastCpuState); if (g.points.you >= 4) break }
}
