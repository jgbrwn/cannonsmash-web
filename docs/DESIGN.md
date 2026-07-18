# CannonSmash Web — Design & Plan

## Goal

A tight, great-looking, mobile-optimized browser remake of CannonSmash that is
true to the original's controls and look, and runs well on older Android
phones.

## History / why the rewrite

The first prototype (React + three.js, `packages/`) was unplayable and slow:

- The game loop was a React `setInterval` at 100 Hz calling `setState` on
  ball/player state every 10 ms — a full React re-render 100×/sec, plus
  `useMemo`s that re-simulated a 260-step ball trajectory on every render.
- Controls were desktop debug UI (sliders + hold/release), not a game.
- Most of the code generated HUD commentary prose rather than gameplay.
- The genuinely good part was a faithful port of the original physics.

The rewrite (July 2026) kept the physics and threw away the rest.

## Architecture

Vanilla TypeScript + three.js. No framework. Files:

| File | Responsibility |
|---|---|
| `src/physics.ts` | Faithful port of original `Ball::Move`, `TargetToV`, `TargetToVS`. Fixed 10 ms step, mutation-based, zero allocations per tick. Contact-point prediction (`predictContact`) reuses one scratch ball. |
| `src/game.ts` | Game state, scoring/rules, your input resolution, CPU AI, difficulty. One `tickGame(g)` mutates a single `GameState`. Emits an `events` bitmask for sounds. |
| `src/scene.ts` | three.js scene built once, mutated per frame. Camera, table, players, paddles, aim marker. Adaptive resolution (`adaptQuality`). |
| `src/input.ts` | Touch/mouse gesture recognition: drag vs flick vs tap. |
| `src/audio.ts` | WebAudio synth SFX (no assets). |
| `src/main.ts` | Fixed-timestep rAF loop, DOM HUD (updated only on change), menu wiring. |
| `test/*.ts` | Headless simulations (run with `npx tsx`) used to validate playability and difficulty balance. |

### Main loop

`requestAnimationFrame` accumulator → N × `tickGame` (10 ms fixed steps) →
sfx from event bits → HUD diff-update → one `renderer.render`. Ticks and
rendering are decoupled; slow devices drop frames, not simulation time.

## Physics (from reverse-engineering notes, `docs/reverse-engineering/notes.md`)

- Tick 0.01 s, table 2.74×1.525×0.76 m, net 0.1525 m, drag `PHY=0.15`,
  bounce `TABLE_E=0.8`, spin-dependent gravity `9.8 + spin*5`.
- Ball status machine 0–8/-1 identical to the original (serve/toss/rally/dead).
- `targetToV` solves launch velocity to land on a target point with net
  clearance via binary search — this is the core of the original's feel: you
  choose *where*, the solver produces the trajectory; `level` scales the pace
  below the net-skimming maximum.
- `targetToVS` is the serve solver (first bounce own side, then clears net).

## Controls design

Original game: mouse moved the player, click swung, and the game
auto-adjusted position during the backswing. So a faithful mobile port keeps
**assisted positioning + player-owned timing/aim**:

- **Drag left/right** = direct lateral paddle control (finger = paddle,
  ~45% of screen width sweeps the full table).
- **Flick** (fast, mostly vertical release) = swing: angle aims, speed+length
  = power, up = topspin, down = backspin. Detected from the last ~130 ms of
  pointer motion before release.
- **No-drag assist**: between drags you drift toward the predicted contact
  at reduced speed (Easy 2.6, Normal 2.1, Hard 1.7 m/s vs 5.2 when dragging),
  so the assist can be out-placed by good CPU shots.
- **Strict contact**: the ball must be within `REACH` (0.55 m) laterally and
  a tight depth window at swing time, else you whiff. Contact centering feeds
  shot quality (paddle sweet spot).
- Flick timing quality: full quality for flicks 0–700 ms before contact,
  decaying after.

## Shot error model

Original `AddError()` perturbs outgoing velocity by fatigue/status. Ours:

- Moderate mishits (quality 0.45–1) mostly *shorten/soften* the ball —
  playable but weak returns.
- Poor contact (quality < 0.45) adds real velocity error → nets/long balls.
- Stamina drains with swings (more for power), recovers slowly; low stamina
  reduces quality.

## CPU AI & difficulty

- Serves: mix of short backspin and fast long, placement randomized.
- Rally: aims away from your current position, mixes depth; low balls are
  pushed, high balls driven.
- Per difficulty: movement speed (0.7/0.95/1.15×), whiff chance
  (7%/2.5%/1.2%), unforced-error rate (30%/14%/5%), contact quality band.
- A whiff/unreached ball is forfeited (the CPU may not re-plan and rescue it).

Validated with `test/human.ts` (sloppy simulated player: variable timing,
6% missed reactions): wins most Easy matches, ~1/6 Normal, 0/6 Hard.
Precise play (`test/diff.ts`) can beat all difficulties.

## Performance (old Android targets)

- Renderer: antialias off, `powerPreference: low-power`, DPR capped at 1.5.
- **Adaptive resolution**: >60 consecutive slow frames (>40 ms) drops pixel
  ratio by 0.25 steps down to 0.75.
- No shadow maps; 1 hemi + 1 directional light; lambert/basic materials;
  low-poly geometry; fake blob ball shadow.
- Zero per-tick allocations in physics/game; DOM HUD writes only on change.

## Look

Dark arena, classic green table with white lines, red court mat, simple
low-poly players (red shirt CPU), first-person-ish camera at head height
behind your paddle — echoing the original's low behind-the-player view.
Paddles are posed with a natural shakehand grip (face turned inward, slightly
closed, wrist roll; backhand mirrored) and animate open→closed through the
stroke.

## Status / done

- [x] Physics port (ball flight, bounce, net cord, serve + rally solvers)
- [x] Fixed-timestep loop, decoupled render
- [x] Swipe/flick controls with drag positioning and strict contact
- [x] Serve/receive/rally, full scoring (11pt, deuce, rotation, best-of-3)
- [x] CPU AI with 3 validated difficulty levels
- [x] SFX, HUD, menu, quit button, stamina bar, aim marker
- [x] Adaptive resolution for low-end devices
- [x] Headless simulation test suite
- [x] systemd static deployment

## Possible next steps

- Ball trail / hit flash for readability at high pace
- Serve placement preview (drag before flick chooses serve spot)
- Player archetypes (PenAttack/PenDrive/ShakeCut from the original)
- Spin visualization (ball tint by spin sign)
- PWA manifest + offline cache for installable app feel
- Haptics (navigator.vibrate) on contact/point
