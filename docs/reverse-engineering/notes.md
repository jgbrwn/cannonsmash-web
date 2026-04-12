# Cannon Smash reverse-engineering notes

## Core constants
- Tick: `0.01s`
- Table: `2.74 x 1.525 x 0.76m`
- Net height: `0.1525m`
- Ball radius: `0.019m`
- Arena: `8 x 12 x 6`
- Drag factor: `PHY = 0.15`
- Bounce coeff: `TABLE_E = 0.8`
- Gravity uses spin: `9.8 + spin*5`

Source: `ttinc.h`

## Ball state machine
From `Ball.h`:
- `0`: side=1 hit -> before opponent bounce
- `1`: side=-1 can hit
- `2`: side=-1 hit -> before opponent bounce
- `3`: side=1 can hit
- `4`: side=1 serve -> before bounce
- `5`: side=-1 serve -> before bounce
- `6`: side=1 toss -> pre-serve hit
- `7`: side=-1 toss -> pre-serve hit
- `8`: waiting for serve
- `-1`: dead/out of rally

## Physics observations
`Ball::Move()` uses deterministic fixed-step simulation.
- Position update includes linear drag.
- Net collision checks crossing `y=0` and compares interpolated `z` and `x`.
- Table collision checks crossing `z=TABLEHEIGHT` within table bounds.
- Bounce applies:
  - `vz *= -TABLE_E`
  - `vy += spin*0.8` or `-= spin*0.8` depending on sign
  - `spin *= 0.8`
- Wall/floor/ceiling contact kills rally.

## Shot solver
`Ball::TargetToV` solves initial `vx,vy,vz` to land on a desired table target.
This is central to game feel and should be ported directly.

`Ball::TargetToVS` is a serve-specific solver that searches first-bounce positions and enforces net clearance.

## Player model
`Player` contains:
- movement velocity
- stamina/status meter
- swing timer/state
- swing type
- fore/backhand side
- target point on opponent table
- camera eye/look-at values

Human play is not pure manual locomotion:
- mouse controls movement velocity
- click triggers swing
- game auto-adjusts player during backswing to help line up hits
- game also auto-backswings when ball prediction suggests a hittable ball soon

This means a faithful mobile remake should keep **assisted positioning/timing**, not raw full-manual movement.

## Swing timing
`Player::Move()`:
- swing starts at `m_swing=1` or `11`
- actual hit occurs at `m_swing == 20`
- swing finishes at `m_swing == 50`

So impact is effectively a fixed animation frame in a 0.5s swing envelope.

## Error/status system
- `m_status` and `m_statusMax` govern shot reliability.
- Movement and swinging drain status.
- difficult placements require higher status (`StatusBorder()`).
- `AddError()` perturbs outgoing velocity direction based on fatigue/status.

This is essential to the original game feel.

## Archetypes
### PenAttack
- offensive, balanced/fast
- likes smash/drive on attackable balls
- stronger forward pace than defensive types

### PenDrive
- forehand-drive oriented
- more topspin bias
- weaker backhand/defensive margins

### ShakeCut
- defensive/chop style
- lower attack pace, more cut/poke behavior
- faster repositioning cap than PenDrive in AI

## AI
AI is simulation-based, not heuristic-only.
- clones the live ball and advances it forward (`tmpBall->Move()`) to estimate apex/hit points.
- chooses `_hitX/_hitY` based on predicted ball path.
- moves velocity toward that point with acceleration caps.
- selects target X late in swing (`m_swing == 19`).

This predictive simulation approach should be preserved.

## Presentation
- SDL + OpenGL fixed-function 3D
- 60-degree perspective camera
- title screen with rotating camera around the court
- optional simple and 2D modes
- play view hides cursor and grabs mouse

## Web remake implications
Port exactly:
- fixed-step sim
- state machine
- target-to-velocity solver
- swing timing window
- status/fatigue/error model
- AI prediction-by-simulation

Modernize:
- rendering stack
- menus/UI
- input mapping for touch
- interpolation/camera smoothing

## Mobile control direction
Suggested faithful-mobile mapping:
- left drag: movement intent
- right drag / tap-release: stroke type, power, spin intent
- target reticle on opponent table with aim assist
- preserve original auto-backswing/auto-position assistance
