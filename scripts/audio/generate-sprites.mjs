#!/usr/bin/env node
// Generates demo-grade audio sprites for the 4 dahua-dice themes via ffmpeg
// synthesis. No external assets required.
//
// Sprite layout (must match lib/audio/useDiceAudio.ts):
//   collide [   0,  200ms ]
//   shake   [ 200, 1200ms ] loop
//   reveal  [1400,  800ms ]
//   win     [2200, 1000ms ]
//   lose    [3200, 1000ms ]
//   click   [4200,  100ms ]
//   total: 4300ms
//
// Regenerate: node scripts/audio/generate-sprites.mjs
// Outputs:    public/audio/{modern,classic,hk,cartoon}.{mp3,webm}
//
// Swap in real CC0 assets later by replacing the per-segment recipes below
// with `-i <path>.wav` inputs and matching afade chains.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const OUT_DIR = join(PROJECT_ROOT, 'public', 'audio');
const TMP = mkdtempSync(join(tmpdir(), 'dahua-audio-'));

const SR = 44100;

// Source generator helpers — these build ffmpeg lavfi source URLs.
// `synth(expr, d)` uses ffmpeg's expression-based audio source filter to make
// custom waveforms (e.g. frequency sweeps for descending tones).
function synth(expression, d) {
  return `aevalsrc=${expression}:d=${d}:s=${SR}`;
}
function noise(color, d, amp = 0.5) {
  return `anoisesrc=color=${color}:duration=${d}:amplitude=${amp}`;
}
function sine(freq, d) {
  return `sine=frequency=${freq}:duration=${d}:sample_rate=${SR}`;
}

// ── per-(theme, segment) recipes ────────────────────────────────────────
// Each returns { inputs: string[], filter: string } where filter ends in [out].

const recipes = {
  modern: {
    collide: () => ({
      inputs: [noise('white', 0.2, 0.6)],
      filter: '[0]bandpass=f=2200:w=1500,afade=t=in:d=0.005,afade=t=out:d=0.18:st=0.02,volume=1.6[out]',
    }),
    shake: () => ({
      inputs: [noise('brown', 1.2, 0.45)],
      filter: '[0]highpass=f=1500,tremolo=f=16:d=0.55,afade=t=in:d=0.02,afade=t=out:d=0.03:st=1.17,volume=1.1[out]',
    }),
    reveal: () => ({
      inputs: [sine(523.25, 0.8), sine(783.99, 0.8)],
      filter:
        '[0]volume=0.5[a];' +
        '[1]volume=0.4[b];' +
        '[a][b]amix=inputs=2:duration=longest,afade=t=in:d=0.03,afade=t=out:d=0.5:st=0.3[out]',
    }),
    win: () => ({
      // C5 → E5 → G5 → C6 arpeggio (250ms each)
      inputs: [sine(523.25, 0.25), sine(659.25, 0.25), sine(783.99, 0.25), sine(1046.5, 0.25)],
      filter:
        '[0]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.55[a];' +
        '[1]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.55[b];' +
        '[2]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.6[c];' +
        '[3]afade=t=in:d=0.01,afade=t=out:d=0.22:st=0.03,volume=0.65[d];' +
        '[a][b][c][d]concat=n=4:v=0:a=1[out]',
    }),
    lose: () => ({
      // Descending sweep 600 → 100 Hz
      inputs: [synth('sin(2*PI*(600-500*t)*t)', 1.0)],
      filter: '[0]afade=t=in:d=0.03,afade=t=out:d=0.5:st=0.5,volume=0.5[out]',
    }),
    click: () => ({
      inputs: [noise('white', 0.1, 0.5)],
      filter: '[0]highpass=f=3000,afade=t=in:d=0.002,afade=t=out:d=0.08:st=0.02,volume=1.0[out]',
    }),
  },

  classic: {
    collide: () => ({
      inputs: [noise('pink', 0.2, 0.7)],
      filter: '[0]bandpass=f=400:w=350,afade=t=in:d=0.005,afade=t=out:d=0.18:st=0.02,volume=1.8[out]',
    }),
    shake: () => ({
      inputs: [noise('pink', 1.2, 0.55)],
      filter: '[0]bandpass=f=350:w=400,tremolo=f=12:d=0.6,afade=t=in:d=0.02,afade=t=out:d=0.03:st=1.17,volume=1.3[out]',
    }),
    reveal: () => ({
      // Warm low chord C4 + G4
      inputs: [sine(261.63, 0.8), sine(392.0, 0.8)],
      filter:
        '[0]volume=0.55[a];' +
        '[1]volume=0.4[b];' +
        '[a][b]amix=inputs=2:duration=longest,afade=t=in:d=0.04,afade=t=out:d=0.5:st=0.3[out]',
    }),
    win: () => ({
      // C4 → E4 → G4 → C5 arpeggio
      inputs: [sine(261.63, 0.25), sine(329.63, 0.25), sine(392.0, 0.25), sine(523.25, 0.25)],
      filter:
        '[0]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.6[a];' +
        '[1]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.6[b];' +
        '[2]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.65[c];' +
        '[3]afade=t=in:d=0.01,afade=t=out:d=0.22:st=0.03,volume=0.7[d];' +
        '[a][b][c][d]concat=n=4:v=0:a=1[out]',
    }),
    lose: () => ({
      // Slower lower descending sweep 400 → 80 Hz
      inputs: [synth('sin(2*PI*(400-320*t)*t)', 1.0)],
      filter: '[0]afade=t=in:d=0.04,afade=t=out:d=0.6:st=0.4,volume=0.55[out]',
    }),
    click: () => ({
      inputs: [noise('pink', 0.1, 0.6)],
      filter: '[0]bandpass=f=1200:w=800,afade=t=in:d=0.002,afade=t=out:d=0.08:st=0.02,volume=1.2[out]',
    }),
  },

  hk: {
    collide: () => ({
      // Porcelain ring — band-passed pink noise + light echo
      inputs: [noise('pink', 0.2, 0.65)],
      filter: '[0]bandpass=f=900:w=500,aecho=0.7:0.7:60:0.4,afade=t=in:d=0.005,afade=t=out:d=0.18:st=0.02,volume=1.6[out]',
    }),
    shake: () => ({
      inputs: [noise('white', 1.2, 0.5)],
      filter: '[0]bandpass=f=600:w=400,tremolo=f=11:d=0.55,aecho=0.7:0.5:35:0.25,afade=t=in:d=0.02,afade=t=out:d=0.03:st=1.17,volume=1.2[out]',
    }),
    reveal: () => ({
      // Pentatonic-ish open chord G4 + D5
      inputs: [sine(392.0, 0.8), sine(587.33, 0.8)],
      filter:
        '[0]volume=0.5[a];' +
        '[1]volume=0.4[b];' +
        '[a][b]amix=inputs=2:duration=longest,aecho=0.7:0.6:80:0.3,afade=t=in:d=0.03,afade=t=out:d=0.5:st=0.3[out]',
    }),
    win: () => ({
      // Pentatonic G4 A4 C5 D5 (skip leading tonic for the "lift")
      inputs: [sine(392.0, 0.25), sine(440.0, 0.25), sine(523.25, 0.25), sine(659.25, 0.25)],
      filter:
        '[0]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.55[a];' +
        '[1]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.6[b];' +
        '[2]afade=t=in:d=0.01,afade=t=out:d=0.2:st=0.05,volume=0.6[c];' +
        '[3]afade=t=in:d=0.01,afade=t=out:d=0.22:st=0.03,volume=0.7[d];' +
        '[a][b][c][d]concat=n=4:v=0:a=1,aecho=0.7:0.5:90:0.25[out]',
    }),
    lose: () => ({
      // Bell-like single descending tone with reverb
      inputs: [synth('sin(2*PI*(500-380*t)*t)', 1.0)],
      filter: '[0]aecho=0.7:0.7:120:0.4,afade=t=in:d=0.04,afade=t=out:d=0.6:st=0.4,volume=0.5[out]',
    }),
    click: () => ({
      inputs: [noise('white', 0.1, 0.5)],
      filter: '[0]bandpass=f=1500:w=1000,afade=t=in:d=0.002,afade=t=out:d=0.08:st=0.02,volume=1.0[out]',
    }),
  },

  cartoon: {
    collide: () => ({
      // Cartoon "boop" — descending sine sweep 800→400 + small noise tail
      inputs: [synth('sin(2*PI*(800-400*t)*t)', 0.2), noise('white', 0.2, 0.25)],
      filter:
        '[0]volume=0.55[a];' +
        '[1]highpass=f=1500,volume=0.6[b];' +
        '[a][b]amix=inputs=2:duration=longest,afade=t=in:d=0.005,afade=t=out:d=0.15:st=0.05,volume=1.4[out]',
    }),
    shake: () => ({
      inputs: [noise('white', 1.2, 0.5)],
      filter: '[0]bandpass=f=800:w=600,tremolo=f=20:d=0.7,afade=t=in:d=0.02,afade=t=out:d=0.03:st=1.17,volume=1.2[out]',
    }),
    reveal: () => ({
      // Quick C5 → E5 → G5 sparkle (rest = silence)
      inputs: [sine(523.25, 0.2), sine(659.25, 0.2), sine(783.99, 0.4)],
      filter:
        '[0]afade=t=in:d=0.01,afade=t=out:d=0.15:st=0.05,volume=0.55[a];' +
        '[1]afade=t=in:d=0.01,afade=t=out:d=0.15:st=0.05,volume=0.6[b];' +
        '[2]afade=t=in:d=0.01,afade=t=out:d=0.35:st=0.05,volume=0.65[c];' +
        '[a][b][c]concat=n=3:v=0:a=1[out]',
    }),
    win: () => ({
      // Rising sine sweep 400→1200 over 800ms + 200ms sparkle tail
      inputs: [synth('sin(2*PI*(400+1000*t)*t)', 0.8), sine(1318.51, 0.2)],
      filter:
        '[0]afade=t=in:d=0.02,afade=t=out:d=0.2:st=0.6,volume=0.5[a];' +
        '[1]afade=t=in:d=0.01,afade=t=out:d=0.18:st=0.02,volume=0.55[b];' +
        '[a][b]concat=n=2:v=0:a=1[out]',
    }),
    lose: () => ({
      // Wah-wah descending sweep 600→150 with tremolo
      inputs: [synth('sin(2*PI*(600-450*t)*t)', 1.0)],
      filter: '[0]tremolo=f=8:d=0.5,afade=t=in:d=0.03,afade=t=out:d=0.5:st=0.5,volume=0.55[out]',
    }),
    click: () => ({
      // Higher-pitched "pop" click
      inputs: [synth('sin(2*PI*(2500-1000*t)*t)', 0.1)],
      filter: '[0]afade=t=in:d=0.002,afade=t=out:d=0.08:st=0.02,volume=0.7[out]',
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
];

function ffmpeg(args) {
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

function ffprobeDuration(path) {
  const out = execFileSync('ffprobe', [
    '-hide_banner', '-loglevel', 'error',
    '-show_entries', 'stream=duration',
    '-of', 'default=nw=1:nk=1',
    path,
  ]).toString().trim();
  return parseFloat(out);
}

function renderSegment(theme, segName, dur, wavPath) {
  const r = recipes[theme][segName]();
  const inputArgs = r.inputs.flatMap((src) => ['-f', 'lavfi', '-i', src]);
  ffmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputArgs,
    '-filter_complex', r.filter,
    '-map', '[out]',
    '-t', String(dur),
    '-ar', String(SR),
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    wavPath,
  ]);
  const got = ffprobeDuration(wavPath);
  if (Math.abs(got - dur) > 0.005) {
    throw new Error(`segment ${theme}/${segName} duration drift: expected ${dur}, got ${got}`);
  }
}

function concatAndEncode(theme, segWavs) {
  const masterWav = join(TMP, `${theme}.wav`);
  ffmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    ...segWavs.flatMap((w) => ['-i', w]),
    '-filter_complex',
    `${segWavs.map((_, i) => `[${i}]`).join('')}concat=n=${segWavs.length}:v=0:a=1[out]`,
    '-map', '[out]',
    '-ar', String(SR),
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    masterWav,
  ]);
  const got = ffprobeDuration(masterWav);
  if (Math.abs(got - 4.3) > 0.005) {
    throw new Error(`${theme} master duration drift: expected 4.3, got ${got}`);
  }

  const mp3Out = join(OUT_DIR, `${theme}.mp3`);
  const webmOut = join(OUT_DIR, `${theme}.webm`);

  // MP3 — libmp3lame writes Xing/LAME info header by default; modern browsers
  // honor it for gapless sample-accurate decode. 96k mono ~= 50KB total.
  ffmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', masterWav,
    '-c:a', 'libmp3lame',
    '-b:a', '96k',
    '-write_xing', '1',
    '-id3v2_version', '0',
    mp3Out,
  ]);

  // WebM Opus — gapless by design, ~40KB at 64k mono.
  ffmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', masterWav,
    '-c:a', 'libopus',
    '-b:a', '64k',
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
      `[${theme}] -> public/audio/${theme}.mp3 (${(mp3Size / 1024).toFixed(1)} KB)`
      + ` + ${theme}.webm (${(webmSize / 1024).toFixed(1)} KB)\n`
    );
  }

  rmSync(TMP, { recursive: true, force: true });
  process.stdout.write('done.\n');
}

main();
