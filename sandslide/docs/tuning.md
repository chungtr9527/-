# Balance tuning (simulation with the real engine)

Run: `npm run sim` (300 games/config) or `node scripts/sim.js --games 1000`. Bots: greedy one-ply placement with eps = share of random moves (0.1 ≈ decent human, 0.3 ≈ weak human). Policies: sensible = tilt when ≥2 lines would clear or when stored is at MAX with ≥1; lazy = only when stuck; eager = whenever ≥1 line. Minutes assume 5 s per placement.

## 2026-10-31 — v0.1.0 constants (charge 60, growth 15, cap 2, start 30, +1/cell, +3/line)

| config | games | placementsMed | placementsP90 | minutesMed | scoreMed | scoreP90 | tiltsPerGame | tiltsPer100 | voluntary2Pct | cappedPct | earlyDeathPct |
|---|---|---|---|---|---|---|---|---|---|---|---|
| classic growth15 sensible (greedy) | 300 | 187 | 310 | 15.6 | 2973 | 5270 | 8.27 | 4.2 | 83 | 0.0 |  |
| classic growth15 sensible eps0.1 | 300 | 125 | 203 | 10.4 | 1862 | 3263 | 6.20 | 4.7 | 88 | 0.0 |  |
| classic growth15 sensible eps0.3 | 300 | 74 | 113 | 6.2 | 917 | 1607 | 3.84 | 5.2 | 97 | 0.0 |  |
| classic growth15 lazy (greedy) | 300 | 600 | 600 | 50.0 | 11428 | 12600 | 11.06 | 2.1 | - | 57.7 |  |
| classic growth15 eager eps0.1 | 300 | 98 | 157 | 8.2 | 1366 | 2496 | 5.05 | 4.9 | 29 | 0.0 |  |
| classic growth0 (flat 60) sensible eps0.1 | 300 | 600 | 600 | 50.0 | 10060 | 10802 | 49.29 | 9.2 | 66 | 77.3 |  |
| classic growth10 sensible eps0.1 | 300 | 146 | 230 | 12.2 | 2298 | 3770 | 7.79 | 5.1 | 85 | 0.0 |  |
| classic growth20 sensible eps0.1 | 300 | 113 | 179 | 9.4 | 1650 | 2883 | 5.26 | 4.3 | 90 | 0.0 |  |
| classic no-tilt eps0.1 (reference) | 300 | 59 | 98 | 4.9 | 731 | 1412 | 0.00 | 0.0 | - | 0.0 |  |
| daily 20 hands sensible eps0.1 | 300 | 60 | 60 | 5.0 | 705 | 854 | 3.34 | 5.6 | 86 | 0.0 | 0.0 |
| daily 20 hands sensible eps0.3 | 300 | 60 | 60 | 5.0 | 703 | 877 | 4.13 | 7.0 | 97 | 0.0 | 7.3 |

Reading:
- Flat cost (growth 0) is unplayable as an endless mode: 77% of decent-bot games never end (capped at 600 placements ≈ 50 min).
- Growth 15 ends every sensible game: weak 6 min / decent 10 min / greedy 16 min, 4–5 tilts per 100 placements, 83–97% of voluntary tilts clear ≥2 lines. Targets met except the weak-player median (6 min vs 8–15 target) — acceptable because real humans place slower than 5 s on messy boards.
- The patient "tilt only when stuck" strategy is the strongest (58% of greedy lazy games pass 600 placements). This is intended mastery, not a bug: tilts are worth most on a full board. Humans place worse than the bot, so expect 30–60 min expert games. If live data shows runs that never end, raise `chargeGrowth` to 20 (decent 9.4 min) — the only knob to touch.
- Daily (20 hands, flat cost 60, cap 3): ~5 min, 3–4 tilts, 0–7% early deaths. Comparable across players because every hand N is drawn from rng(seed, N).
