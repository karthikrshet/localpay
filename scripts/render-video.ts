// Renders the README video from docs/video/index.html (see docs/video/README.md).
// Needs FFmpeg on PATH, or FFMPEG=/path/to/ffmpeg.
//   node --experimental-strip-types scripts/render-video.ts            full render
//   node --experimental-strip-types scripts/render-video.ts --stills   one PNG per scene for review
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const FPS = 30;
const DURATION = 23;
/** A settled outro frame: the poster, and frame 0 of the video so every player shows it. */
const POSTER_AT = 22.2;
const VIDEO_DIR = 'docs/video';
const OUT = 'docs/assets';
const WORK = join(VIDEO_DIR, '.work');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

interface Cue {
  file: string;
  at: number;
  volume: number;
}

// Sound effects, timed to the animation in index.html. Music sits under them.
const keys = (start: number, count: number, step: number): Cue[] =>
  Array.from({ length: count }, (_, i) => ({ file: `keypress-00${(i % 8) + 1}.wav`, at: start + i * step, volume: 0.35 }));
const CUES: Cue[] = [
  ...[1.52, 2.02, 2.52].map((at) => ({ file: 'click1.ogg', at, volume: 0.55 })),
  { file: 'impactSoft_medium_001.ogg', at: 3.42, volume: 0.6 },
  ...keys(3.8, 12, 0.07),
  { file: 'click_002.ogg', at: 4.75, volume: 0.7 },
  { file: 'drop_002.ogg', at: 4.9, volume: 0.5 },
  { file: 'card-slide-1.ogg', at: 7.7, volume: 0.55 },
  { file: 'mouseclick1.ogg', at: 9.52, volume: 0.7 },
  { file: 'error_005.ogg', at: 9.64, volume: 0.3 },
  { file: 'mouseclick1.ogg', at: 10.52, volume: 0.7 },
  ...[11.47, 11.97, 12.47, 13.47].map((at, i) => ({ file: `drop_00${(i % 3) + 1}.ogg`, at, volume: 0.5 })),
  ...keys(15.3, 25, 0.035).filter((_, i) => i % 2 === 0),
  { file: 'click_002.ogg', at: 16.2, volume: 0.6 },
  { file: 'chips-stack-1.ogg', at: 16.1, volume: 0.4 },
  { file: 'impactSoft_medium_001.ogg', at: 17.02, volume: 0.6 },
  ...[17.52, 18.02, 18.52].map((at, i) => ({ file: `drop_00${i + 1}.ogg`, at: at - 0.04, volume: 0.45 })),
  { file: 'impactBell_heavy_000.ogg', at: 20.02, volume: 0.55 },
  { file: 'click2.ogg', at: 21.0, volume: 0.5 },
];

function run(args: string[]): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', fail);
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited with ${code}`))));
  });
}

// The real checkout stylesheet, so the popup in the video is the popup in the product.
const stylesSource = readFileSync('packages/checkout/src/styles.ts', 'utf8');
const checkoutStyles = /`([\s\S]*)`/.exec(stylesSource)?.[1];
if (!checkoutStyles) throw new Error('Could not read STYLES from packages/checkout/src/styles.ts');

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'light' });
await page.goto(pathToFileURL(resolve(VIDEO_DIR, 'index.html')).href);
await page.addStyleTag({ content: checkoutStyles.replace(':host { all: initial; }', '') });
// String expressions run in the page, which keeps DOM types out of this Node script.
await page.evaluate('document.fonts.ready.then(() => true)');
const frameAt = async (seconds: number): Promise<Buffer> => {
  await page.evaluate(`window.render(${seconds})`);
  return page.screenshot({ type: 'png' });
};

if (process.argv.includes('--stills')) {
  const times = [1.2, 3.0, 4.4, 6.9, 8.4, 9.8, 10.9, 12.2, 14.6, 16.4, 18.8, 19.1, 20.6, POSTER_AT];
  for (const t of times) {
    const png = await frameAt(t);
    writeFileSync(join(WORK, `still-${t.toFixed(2)}.png`), png);
  }
  await browser.close();
  console.log(`Stills in ${WORK}`);
  process.exit(0);
}

// 1. Frames → silent video. Frame 0 is the poster.
const silent = join(WORK, 'silent.mp4');
const encoder = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-tune', 'animation', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const encoded = new Promise<void>((done, fail) => encoder.on('exit', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited with ${code}`)))));
const frames = Math.round(DURATION * FPS);
for (let i = 0; i < frames; i++) {
  const png = await frameAt(i === 0 ? POSTER_AT : i / FPS);
  if (!encoder.stdin.write(png)) await new Promise((r) => encoder.stdin.once('drain', r));
  if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${frames}`);
}
encoder.stdin.end();
await encoded;
await frameAt(POSTER_AT);
await page.screenshot({ type: 'jpeg', quality: 90, path: join(OUT, 'localpay-demo.jpg') });
await browser.close();
process.stdout.write('\n');

// 2. Music + sound effects, mixed under a limiter.
const audio = join(VIDEO_DIR, 'audio');
const inputs = ['-i', silent, '-i', join(audio, 'music.mp3'), ...CUES.flatMap((c) => ['-i', join(audio, 'sfx', c.file)])];
const filters = [`[1:a]atrim=0:${DURATION},volume=0.6,afade=t=in:d=0.25,afade=t=out:st=${DURATION - 1.8}:d=1.8[m]`];
CUES.forEach((cue, i) => {
  const ms = Math.round(cue.at * 1000);
  filters.push(`[${i + 2}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms},volume=${cue.volume}[s${i}]`);
});
filters.push(`[m]${CUES.map((_, i) => `[s${i}]`).join('')}amix=inputs=${CUES.length + 1}:normalize=0:duration=first,alimiter=limit=0.9[a]`);
await run([...inputs, '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', '-t', String(DURATION), join(OUT, 'localpay-demo.mp4')]);

// 3. Silent GIF preview for the README (GitHub plays GIFs inline, not repo MP4s).
const palette = join(WORK, 'palette.png');
// 720px, 10fps and 48 colours keep it under 4 MB; the flat light UI needs no dithering.
const gifFilter = 'fps=10,scale=720:-1:flags=lanczos';
await run(['-i', silent, '-vf', `${gifFilter},palettegen=max_colors=48:stats_mode=diff`, palette]);
await run(['-i', silent, '-i', palette, '-lavfi', `${gifFilter}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`, join(OUT, 'localpay-demo.gif')]);

rmSync(WORK, { recursive: true, force: true });
console.log(`Wrote ${OUT}/localpay-demo.mp4, .jpg and .gif`);
