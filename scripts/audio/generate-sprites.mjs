#!/usr/bin/env node
// Generates the 4 dahua-dice audio sprite sheets via ffmpeg synthesis.
// No external assets required.
//
// DSP model (per percussive hit): sharp noise transient (fast attack +
// exponential decay) + short tonal body/resonance + fast decay. The shake
// segment layers 6-8 discrete band-passed clacks at irregular offsets with
// per-hit pitch variation over a gated cup-body rumble — i.e. real dice
// rattling, not continuous static. A length-preserving polish chain (sub-rumble
// highpass + presence shelf + soft lookahead limiter) sits on every segment so
// the strict sprite timing is never altered.
//
// Sprite layout (must match lib/audio/useDiceAudio.ts):
//   collide [   0,  200ms ]
//   shake   [ 200, 1200ms ] loop
//   reveal  [1400,  800ms ]
//   win     [2200, 1000ms ]
//   lose    [3200, 1000ms ]
//   click   [4200,  100ms ]
//   settle  [4300,  300ms ]
//   stinger [4600,  900ms ]
//   total: 5500ms
//
// Regenerate: node scripts/audio/generate-sprites.mjs
// Outputs:    public/audio/{modern,classic,hk,cartoon}.{mp3,webm}
//
// Swap in real CC0 assets later by replacing the per-segment recipes below
// with `-i <path>.wav` inputs and matching afade chains.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const OUT_DIR = join(PROJECT_ROOT, 'public', 'audio');
const TMP = mkdtempSync(join(tmpdir(), 'dahua-audio-'));

const SR = 44100;

// Length-preserving TONAL polish applied to every segment before normalization:
// clear sub-rumble + a gentle presence shelf for crispness. Final leveling is
// done by a measured peak-normalize pass (see renderSegment) so every segment
// lands at a deterministic, consistent loudness regardless of how much energy
// its filters left — narrow band-pass recipes (e.g. classic/hk click) would
// otherwise come out near-silent. None of these change duration.
const POLISH = 'highpass=f=35,treble=g=3:f=4500';

// Per-segment target PEAK (dBFS) for the normalize pass. These encode the
// intended *relative* loudness between cues (a UI click is deliberately quieter
// than a win) while guaranteeing nothing is accidentally inaudible. The runtime
// (useDiceAudio.ts) still applies its own per-event volume on top.
const TARGET_PEAK_DB = {
  collide: -1.0,
  shake: -1.0,
  reveal: -3.0,
  win: -2.0,
  lose: -3.0,
  click: -6.0,
  settle: -4.0,
  stinger: -2.0,
};

// Wrap a recipe filtergraph (which ends in `[out]`) with the tonal polish chain.
function withPolish(filter) {
  return filter.replace(/\[out\]\s*$/, `[pre];[pre]${POLISH}[out]`);
}

// ── source generators (build ffmpeg lavfi source URLs) ──────────────────
// `synth(expr, d)` uses ffmpeg's expression-based audio source to make custom
// waveforms (e.g. frequency sweeps for descending tones).
function synth(expression, d) {
  return `aevalsrc=${expression}:d=${d}:s=${SR}`;
}
function noise(color, d, amp = 0.5) {
  return `anoisesrc=color=${color}:duration=${d}:amplitude=${amp}`;
}
function sine(freq, d) {
  return `sine=frequency=${freq}:duration=${d}:sample_rate=${SR}`;
}

// ── envelope helpers ────────────────────────────────────────────────────
// Percussive hit envelope: near-instant attack, exponential decay. `start` is
// when decay begins (s), `decay` its length (s). exp curve = natural "tok" tail.
function hit(attack, start, decay) {
  return `afade=t=in:d=${attack},afade=t=out:st=${start}:d=${decay}:curve=exp`;
}
// Gentle musical envelope for tonal cues (sine attack-in, smooth fade-out).
function tone(attack, start, decay) {
  return `afade=t=in:d=${attack},afade=t=out:st=${start}:d=${decay}`;
}

// Build a discrete dice-clack rattle from ONE white-noise input.
// `hits` = [{ at, f, w, decay, vol }]. Each hit is a band-passed noise burst
// (pitch = f, width = w) delayed to `at` (s) with its own exponential decay.
// Returns the full filtergraph string for the [0]=body, [1]=noise inputs.
function rattle({ bodyHp, bodyLp, bodyVol, hits, limiterIn, fadeOutAt }) {
  const n = hits.length;
  const labels = hits.map((_, i) => `c${i}`);
  // Body is a QUIET, slowly-pulsing low bed (tremolo = the cup shaking) — it sits
  // well under the clacks so the discrete hits dominate instead of smearing into
  // continuous rushing noise.
  const out = [
    `[0]highpass=f=${bodyHp},lowpass=f=${bodyLp},tremolo=f=13:d=0.7,volume=${bodyVol}[body]`,
    `[1]asplit=${n}${labels.map((l) => `[${l}]`).join('')}`,
  ];
  hits.forEach((h, i) => {
    const delayMs = Math.round(h.at * 1000);
    out.push(
      `[c${i}]bandpass=f=${h.f}:w=${h.w},adelay=${delayMs},` +
        `afade=t=out:st=${h.at.toFixed(3)}:d=${h.decay}:curve=exp,volume=${h.vol}[k${i}]`,
    );
  });
  const mixIns = ['[body]', ...hits.map((_, i) => `[k${i}]`)].join('');
  out.push(
    `${mixIns}amix=inputs=${n + 1}:duration=longest:normalize=0,` +
      `afade=t=in:d=0.02,afade=t=out:st=${fadeOutAt}:d=0.04,` +
      `alimiter=level_in=${limiterIn}:limit=0.95:level=disabled[out]`,
  );
  return out.join(';');
}

// 11 irregularly-spaced clacks over 1.2s (~90-130ms apart) = a dense rattle.
// Sharp decays (28-35ms) keep each clack a distinct percussive event; alternating
// accent/ghost volumes give organic dynamics. The recipe limiter is kept gentle
// so the clack-vs-rest contrast survives — final loudness is set by the normalize
// pass.
const RATTLE_SLOTS = [0.02, 0.13, 0.25, 0.34, 0.47, 0.56, 0.69, 0.8, 0.92, 1.02, 1.12];
const RATTLE_DECAYS = [0.035, 0.03, 0.035, 0.028, 0.035, 0.028, 0.035, 0.028, 0.035, 0.028, 0.03];
const RATTLE_VOLS = [3.0, 2.2, 3.0, 2.0, 3.0, 2.1, 3.0, 2.0, 3.0, 2.0, 2.6];

// Build the clack list for a theme. `centers` cycles the per-hit band centers
// (pitch jitter — alternating high/low gives the irregular rattle pitch), `w` the
// band width. `centers` may be any length; it wraps to cover all slots.
function rattleHits(centers, w) {
  return RATTLE_SLOTS.map((at, i) => ({
    at,
    f: centers[i % centers.length],
    w,
    decay: RATTLE_DECAYS[i],
    vol: RATTLE_VOLS[i],
  }));
}

// ── per-(theme, segment) recipes ────────────────────────────────────────
// Each returns { inputs: string[], filter: string } where filter ends in [out].

const recipes = {
  modern: {
    collide: () => ({
      // Crisp synthetic "tok": noise transient + two resonant body tones,
      // each on an exponential percussion decay.
      inputs: [noise('white', 0.2, 0.9), sine(1700, 0.2), sine(2600, 0.2)],
      filter:
        `[0]highpass=f=1500,${hit(0.001, 0.004, 0.05)},volume=1.6[t];` +
        `[1]${hit(0.001, 0.0, 0.09)},volume=0.7[b1];` +
        `[2]${hit(0.001, 0.0, 0.06)},volume=0.42[b2];` +
        '[t][b1][b2]amix=inputs=3:duration=longest:normalize=0,highpass=f=180[out]',
    }),
    shake: () => ({
      // Bright plastic-die rattle: tight high clacks over a contained body bed.
      inputs: [noise('brown', 1.2, 0.7), noise('white', 1.2, 1.0)],
      filter: rattle({
        bodyHp: 280,
        bodyLp: 1500,
        bodyVol: 0.45,
        hits: rattleHits([2200, 2600, 1900, 2400, 2100, 2750, 2000, 2500], 1600),
        limiterIn: 1.2,
        fadeOutAt: 1.16,
      }),
    }),
    reveal: () => ({
      // Clean perfect-fifth chime (C5 + G5) with a soft bell decay.
      inputs: [sine(523.25, 0.8), sine(783.99, 0.8)],
      filter:
        '[0]volume=0.5[a];' +
        '[1]volume=0.4[b];' +
        `[a][b]amix=inputs=2:duration=longest,${tone(0.02, 0.25, 0.55)}[out]`,
    }),
    win: () => ({
      // C5 → E5 → G5 → C6 arpeggio (250ms each), bell-like exp tails.
      inputs: [sine(523.25, 0.25), sine(659.25, 0.25), sine(783.99, 0.25), sine(1046.5, 0.25)],
      filter:
        `[0]${hit(0.008, 0.04, 0.22)},volume=0.55[a];` +
        `[1]${hit(0.008, 0.04, 0.22)},volume=0.55[b];` +
        `[2]${hit(0.008, 0.04, 0.22)},volume=0.6[c];` +
        `[3]${hit(0.008, 0.02, 0.24)},volume=0.68[d];` +
        '[a][b][c][d]concat=n=4:v=0:a=1[out]',
    }),
    lose: () => ({
      // Descending sweep 600 → 100 Hz with a slight detuned shadow for body.
      inputs: [synth('sin(2*PI*(600-500*t)*t)', 1.0), synth('0.5*sin(2*PI*(300-250*t)*t)', 1.0)],
      filter:
        '[0]volume=0.55[a];[1]volume=0.3[b];' +
        `[a][b]amix=inputs=2:duration=longest:normalize=0,${tone(0.03, 0.45, 0.55)}[out]`,
    }),
    click: () => ({
      // Snappy UI tick: high noise transient, exp decay.
      inputs: [noise('white', 0.1, 0.8)],
      filter: `[0]highpass=f=2800,${hit(0.001, 0.002, 0.045)},volume=1.4[out]`,
    }),
    settle: () => ({
      // Dice coming to rest: two decreasing taps + a soft low body thud.
      inputs: [noise('white', 0.3, 0.8), sine(300, 0.3)],
      filter:
        '[0]asplit=2[s0][s1];' +
        `[s0]bandpass=f=900:w=800,adelay=10,afade=t=out:st=0.010:d=0.06:curve=exp,volume=2.4[t0];` +
        `[s1]bandpass=f=750:w=700,adelay=140,afade=t=out:st=0.140:d=0.05:curve=exp,volume=1.5[t1];` +
        `[1]${hit(0.004, 0.01, 0.22)},volume=0.45[body];` +
        '[t0][t1][body]amix=inputs=3:duration=longest:normalize=0[out]',
    }),
    stinger: () => ({
      // Dramatic riser — low ascending sweep + tense drone (开 suspense).
      inputs: [synth('sin(2*PI*(130+200*t)*t)', 0.9), sine(196, 0.9)],
      filter:
        `[0]${tone(0.05, 0.65, 0.25)},volume=0.6[a];` +
        `[1]tremolo=f=9:d=0.4,${tone(0.05, 0.6, 0.3)},volume=0.4[b];` +
        '[a][b]amix=inputs=2:duration=longest:normalize=0,volume=1.2[out]',
    }),
  },

  classic: {
    collide: () => ({
      // Warm wooden knock: low-mid noise tap + a resonant wood body tone.
      inputs: [noise('pink', 0.2, 0.95), sine(440, 0.2), sine(620, 0.2)],
      filter:
        `[0]bandpass=f=900:w=900,${hit(0.001, 0.003, 0.055)},volume=1.7[t];` +
        `[1]${hit(0.001, 0.0, 0.1)},volume=0.6[b1];` +
        `[2]${hit(0.001, 0.0, 0.07)},volume=0.4[b2];` +
        '[t][b1][b2]amix=inputs=3:duration=longest:normalize=0,highpass=f=140[out]',
    }),
    shake: () => ({
      // Wooden cup rattle: lower, woodier clacks over a warm body bed.
      inputs: [noise('pink', 1.2, 0.8), noise('pink', 1.2, 1.0)],
      filter: rattle({
        bodyHp: 200,
        bodyLp: 1100,
        bodyVol: 0.55,
        hits: rattleHits([1200, 1500, 1000, 1400, 1100, 1600, 1050, 1450], 1100),
        limiterIn: 1.2,
        fadeOutAt: 1.16,
      }),
    }),
    reveal: () => ({
      // Warm low chord C4 + G4 with a slow fade.
      inputs: [sine(261.63, 0.8), sine(392.0, 0.8)],
      filter:
        '[0]volume=0.55[a];' +
        '[1]volume=0.4[b];' +
        `[a][b]amix=inputs=2:duration=longest,${tone(0.03, 0.25, 0.55)}[out]`,
    }),
    win: () => ({
      // C4 → E4 → G4 → C5 arpeggio, warm exp tails.
      inputs: [sine(261.63, 0.25), sine(329.63, 0.25), sine(392.0, 0.25), sine(523.25, 0.25)],
      filter:
        `[0]${hit(0.008, 0.04, 0.22)},volume=0.6[a];` +
        `[1]${hit(0.008, 0.04, 0.22)},volume=0.6[b];` +
        `[2]${hit(0.008, 0.04, 0.22)},volume=0.65[c];` +
        `[3]${hit(0.008, 0.02, 0.24)},volume=0.72[d];` +
        '[a][b][c][d]concat=n=4:v=0:a=1[out]',
    }),
    lose: () => ({
      // Slower lower descending sweep 400 → 80 Hz + sub shadow.
      inputs: [synth('sin(2*PI*(400-320*t)*t)', 1.0), synth('0.5*sin(2*PI*(200-160*t)*t)', 1.0)],
      filter:
        '[0]volume=0.6[a];[1]volume=0.3[b];' +
        `[a][b]amix=inputs=2:duration=longest:normalize=0,${tone(0.04, 0.4, 0.6)}[out]`,
    }),
    click: () => ({
      // Woody tick.
      inputs: [noise('pink', 0.1, 0.9)],
      filter: `[0]bandpass=f=1100:w=900,${hit(0.001, 0.002, 0.05)},volume=1.5[out]`,
    }),
    settle: () => ({
      // Warm wooden settle: two decreasing taps + low body.
      inputs: [noise('pink', 0.3, 0.9), sine(220, 0.3)],
      filter:
        '[0]asplit=2[s0][s1];' +
        `[s0]bandpass=f=620:w=600,adelay=10,afade=t=out:st=0.010:d=0.07:curve=exp,volume=2.4[t0];` +
        `[s1]bandpass=f=520:w=500,adelay=150,afade=t=out:st=0.150:d=0.06:curve=exp,volume=1.5[t1];` +
        `[1]${hit(0.004, 0.01, 0.24)},volume=0.5[body];` +
        '[t0][t1][body]amix=inputs=3:duration=longest:normalize=0[out]',
    }),
    stinger: () => ({
      // Low warm drone with slow tremolo — bar-room tension.
      inputs: [synth('sin(2*PI*(100+150*t)*t)', 0.9), sine(147, 0.9)],
      filter:
        `[0]${tone(0.06, 0.6, 0.3)},volume=0.6[a];` +
        `[1]tremolo=f=7:d=0.45,${tone(0.06, 0.55, 0.35)},volume=0.45[b];` +
        '[a][b]amix=inputs=2:duration=longest:normalize=0,volume=1.2[out]',
    }),
  },

  hk: {
    collide: () => ({
      // Porcelain ring: bright tap + two high resonant tones + light echo tail.
      inputs: [noise('white', 0.2, 0.9), sine(1400, 0.2), sine(2100, 0.2)],
      filter:
        `[0]bandpass=f=1600:w=1400,${hit(0.001, 0.003, 0.06)},volume=1.6[t];` +
        `[1]${hit(0.001, 0.0, 0.12)},volume=0.55[b1];` +
        `[2]${hit(0.001, 0.0, 0.09)},volume=0.4[b2];` +
        '[t][b1][b2]amix=inputs=3:duration=longest:normalize=0,aecho=0.7:0.6:40:0.22,highpass=f=180[out]',
    }),
    shake: () => ({
      // Enamel cup rattle: bright ceramic clacks + a hint of room echo.
      inputs: [noise('white', 1.2, 0.65), noise('white', 1.2, 1.0)],
      filter: rattle({
        bodyHp: 350,
        bodyLp: 1700,
        bodyVol: 0.4,
        hits: rattleHits([2600, 3000, 2400, 2800, 2500, 3100, 2450, 2900], 1500),
        limiterIn: 1.2,
        fadeOutAt: 1.16,
      }).replace('alimiter=', 'aecho=0.7:0.5:28:0.18,alimiter='),
    }),
    reveal: () => ({
      // Pentatonic-ish open chord G4 + D5 with room echo.
      inputs: [sine(392.0, 0.8), sine(587.33, 0.8)],
      filter:
        '[0]volume=0.5[a];' +
        '[1]volume=0.4[b];' +
        `[a][b]amix=inputs=2:duration=longest,aecho=0.7:0.6:80:0.3,${tone(0.03, 0.25, 0.55)}[out]`,
    }),
    win: () => ({
      // Pentatonic G4 A4 C5 D5 (skip leading tonic for the "lift"), echo tail.
      inputs: [sine(392.0, 0.25), sine(440.0, 0.25), sine(523.25, 0.25), sine(659.25, 0.25)],
      filter:
        `[0]${hit(0.008, 0.04, 0.22)},volume=0.55[a];` +
        `[1]${hit(0.008, 0.04, 0.22)},volume=0.6[b];` +
        `[2]${hit(0.008, 0.04, 0.22)},volume=0.6[c];` +
        `[3]${hit(0.008, 0.02, 0.24)},volume=0.7[d];` +
        '[a][b][c][d]concat=n=4:v=0:a=1,aecho=0.7:0.5:90:0.25[out]',
    }),
    lose: () => ({
      // Bell-like single descending tone with reverb-ish echo.
      inputs: [synth('sin(2*PI*(500-380*t)*t)', 1.0)],
      filter: `[0]aecho=0.7:0.7:120:0.4,${tone(0.04, 0.4, 0.6)},volume=0.5[out]`,
    }),
    click: () => ({
      // Bright ceramic tick.
      inputs: [noise('white', 0.1, 0.8)],
      filter: `[0]bandpass=f=1700:w=1200,${hit(0.001, 0.002, 0.05)},volume=1.4[out]`,
    }),
    settle: () => ({
      // Porcelain settle: two bright decreasing taps + echo, light body.
      inputs: [noise('white', 0.3, 0.8), sine(640, 0.3)],
      filter:
        '[0]asplit=2[s0][s1];' +
        `[s0]bandpass=f=1500:w=1200,adelay=10,afade=t=out:st=0.010:d=0.06:curve=exp,volume=2.2[t0];` +
        `[s1]bandpass=f=1200:w=1000,adelay=140,afade=t=out:st=0.140:d=0.05:curve=exp,volume=1.4[t1];` +
        `[1]${hit(0.004, 0.01, 0.22)},volume=0.4[body];` +
        '[t0][t1][body]amix=inputs=3:duration=longest:normalize=0,aecho=0.7:0.5:35:0.2[out]',
    }),
    stinger: () => ({
      // Neon riser with echo tail.
      inputs: [synth('sin(2*PI*(160+260*t)*t)', 0.9), sine(330, 0.9)],
      filter:
        `[0]aecho=0.7:0.6:90:0.3,${tone(0.05, 0.65, 0.25)},volume=0.55[a];` +
        `[1]tremolo=f=10:d=0.4,${tone(0.05, 0.6, 0.3)},volume=0.4[b];` +
        '[a][b]amix=inputs=2:duration=longest:normalize=0,volume=1.15[out]',
    }),
  },

  cartoon: {
    collide: () => ({
      // Cartoon "boop": descending sine sweep + a crisp noise tick on exp decay.
      inputs: [synth('sin(2*PI*(820-420*t)*t)', 0.2), noise('white', 0.2, 0.5)],
      filter:
        `[0]${tone(0.004, 0.06, 0.13)},volume=0.65[a];` +
        `[1]highpass=f=1800,${hit(0.001, 0.003, 0.05)},volume=0.9[b];` +
        '[a][b]amix=inputs=2:duration=longest:normalize=0,volume=1.3[out]',
    }),
    shake: () => ({
      // Bouncy plastic rattle: very bright, snappy clacks over a light body.
      inputs: [noise('white', 1.2, 0.55), noise('white', 1.2, 1.0)],
      filter: rattle({
        bodyHp: 400,
        bodyLp: 2000,
        bodyVol: 0.4,
        hits: rattleHits([1800, 2400, 2000, 2600, 1900, 2700, 2100, 2500], 900),
        limiterIn: 1.2,
        fadeOutAt: 1.16,
      }),
    }),
    reveal: () => ({
      // Quick C5 → E5 → G5 sparkle with snappy exp tails (rest = silence).
      inputs: [sine(523.25, 0.2), sine(659.25, 0.2), sine(783.99, 0.4)],
      filter:
        `[0]${hit(0.006, 0.05, 0.15)},volume=0.55[a];` +
        `[1]${hit(0.006, 0.05, 0.15)},volume=0.6[b];` +
        `[2]${hit(0.006, 0.05, 0.35)},volume=0.65[c];` +
        '[a][b][c]concat=n=3:v=0:a=1[out]',
    }),
    win: () => ({
      // Rising sine sweep 400→1200 over 800ms + 200ms sparkle tail.
      inputs: [synth('sin(2*PI*(400+1000*t)*t)', 0.8), sine(1318.51, 0.2)],
      filter:
        `[0]${tone(0.02, 0.6, 0.2)},volume=0.5[a];` +
        `[1]${hit(0.008, 0.02, 0.18)},volume=0.55[b];` +
        '[a][b]concat=n=2:v=0:a=1[out]',
    }),
    lose: () => ({
      // Wah-wah descending sweep 600→150 with tremolo.
      inputs: [synth('sin(2*PI*(600-450*t)*t)', 1.0)],
      filter: `[0]tremolo=f=8:d=0.5,${tone(0.03, 0.5, 0.5)},volume=0.6[out]`,
    }),
    click: () => ({
      // Higher-pitched descending "pop" click on exp decay.
      inputs: [synth('sin(2*PI*(2500-1000*t)*t)', 0.1)],
      filter: `[0]${hit(0.001, 0.002, 0.06)},volume=0.85[out]`,
    }),
    settle: () => ({
      // Cartoon plop: quick descending boop landing + soft noise tail.
      inputs: [synth('sin(2*PI*(520-260*t)*t)', 0.3), noise('white', 0.3, 0.4)],
      filter:
        `[0]${tone(0.005, 0.05, 0.24)},volume=0.65[a];` +
        `[1]highpass=f=2000,${hit(0.002, 0.01, 0.1)},volume=0.55[b];` +
        '[a][b]amix=inputs=2:duration=longest:normalize=0,volume=1.2[out]',
    }),
    stinger: () => ({
      // Comedic "dun-dun-dunnn" — three descending stabs with exp tails.
      inputs: [sine(330, 0.3), sine(294, 0.3), sine(220, 0.3)],
      filter:
        `[0]${hit(0.008, 0.06, 0.22)},volume=0.6[a];` +
        `[1]${hit(0.008, 0.06, 0.22)},volume=0.6[b];` +
        `[2]${hit(0.008, 0.04, 0.26)},volume=0.7[c];` +
        '[a][b][c]concat=n=3:v=0:a=1[out]',
    }),
  },
};

const themes = ['modern', 'classic', 'hk', 'cartoon'];

// Segment order + target duration (must match useDiceAudio.ts)
const segments = [
  ['collide', 0.2],
  ['shake', 1.2],
  ['reveal', 0.8],
  ['win', 1.0],
  ['lose', 1.0],
  ['click', 0.1],
  ['settle', 0.3],
  ['stinger', 0.9],
];

// Master total = sum of segment durations (must match useDiceAudio sprite map).
const TOTAL_SEC = segments.reduce((s, [, d]) => s + d, 0); // 5.5

function ffmpeg(args) {
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

function ffprobeDuration(path) {
  const out = execFileSync('ffprobe', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-show_entries',
    'stream=duration',
    '-of',
    'default=nw=1:nk=1',
    path,
  ])
    .toString()
    .trim();
  return parseFloat(out);
}

// Measure the peak amplitude (dBFS) of a rendered file via volumedetect, which
// prints to stderr and exits 0 — spawnSync lets us read .stderr directly.
// Returns -Infinity for true silence (volumedetect omits max_volume then).
// Used by the per-segment normalize pass.
function measurePeakDb(path) {
  const res = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const m = (res.stderr || '').match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  return m ? parseFloat(m[1]) : Number.NEGATIVE_INFINITY;
}

function renderSegment(theme, segName, dur, wavPath) {
  const r = recipes[theme][segName]();
  const inputArgs = r.inputs.flatMap((src) => ['-f', 'lavfi', '-i', src]);

  // Pass 1 — render the recipe + tonal polish to a raw WAV.
  const rawWav = wavPath.replace(/\.wav$/, '.raw.wav');
  ffmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputArgs,
    '-filter_complex',
    withPolish(r.filter),
    '-map',
    '[out]',
    '-t',
    String(dur),
    '-ar',
    String(SR),
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    rawWav,
  ]);

  // Pass 2 — measure peak, apply makeup gain to hit the segment's target peak,
  // then a gentle ceiling limiter to catch any transient overshoot. Both filters
  // are length-preserving, so the strict sprite timing is untouched.
  const rawPeak = measurePeakDb(rawWav);
  const target = TARGET_PEAK_DB[segName];
  if (target == null) throw new Error(`no target peak for segment ${segName}`);
  const gain = Number.isFinite(rawPeak) ? (target - rawPeak).toFixed(2) : '0';
  ffmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    rawWav,
    '-af',
    `volume=${gain}dB,alimiter=level_in=1:limit=0.97:level=disabled`,
    '-ar',
    String(SR),
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    wavPath,
  ]);
  rmSync(rawWav, { force: true });

  const got = ffprobeDuration(wavPath);
  if (Math.abs(got - dur) > 0.005) {
    throw new Error(`segment ${theme}/${segName} duration drift: expected ${dur}, got ${got}`);
  }
}

function concatAndEncode(theme, segWavs) {
  const masterWav = join(TMP, `${theme}.wav`);
  ffmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...segWavs.flatMap((w) => ['-i', w]),
    '-filter_complex',
    `${segWavs.map((_, i) => `[${i}]`).join('')}concat=n=${segWavs.length}:v=0:a=1[out]`,
    '-map',
    '[out]',
    '-ar',
    String(SR),
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    masterWav,
  ]);
  const got = ffprobeDuration(masterWav);
  if (Math.abs(got - TOTAL_SEC) > 0.005) {
    throw new Error(`${theme} master duration drift: expected ${TOTAL_SEC}, got ${got}`);
  }

  const mp3Out = join(OUT_DIR, `${theme}.mp3`);
  const webmOut = join(OUT_DIR, `${theme}.webm`);

  // MP3 — libmp3lame writes Xing/LAME info header by default; modern browsers
  // honor it for gapless sample-accurate decode. 96k mono ~= 65KB total.
  ffmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    masterWav,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '96k',
    '-write_xing',
    '1',
    '-id3v2_version',
    '0',
    mp3Out,
  ]);

  // WebM Opus — gapless by design, ~45KB at 64k mono.
  ffmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    masterWav,
    '-c:a',
    'libopus',
    '-b:a',
    '64k',
    webmOut,
  ]);

  const mp3Size = statSync(mp3Out).size;
  const webmSize = statSync(webmOut).size;
  return { mp3Size, webmSize };
}

function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const theme of themes) {
    process.stdout.write(`[${theme}] generating segments\n`);
    const segWavs = [];
    for (const [name, dur] of segments) {
      const wav = join(TMP, `${theme}_${name}.wav`);
      renderSegment(theme, name, dur, wav);
      segWavs.push(wav);
    }
    const { mp3Size, webmSize } = concatAndEncode(theme, segWavs);
    process.stdout.write(
      `[${theme}] -> public/audio/${theme}.mp3 (${(mp3Size / 1024).toFixed(1)} KB)` +
        ` + ${theme}.webm (${(webmSize / 1024).toFixed(1)} KB)\n`,
    );
  }

  rmSync(TMP, { recursive: true, force: true });
  process.stdout.write('done.\n');
}

main();
