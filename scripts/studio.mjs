#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { checkAudio } from './video.mjs';
import { validateScenes, validateCaptions } from './scene-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const html = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pinned = json(path.join(root, 'package.json')).dependencies.hyperframes;

export function runtimeEnv(base = process.env) {
  const env = { ...base, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_AUTO_INSTALL: '1',
    HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1' };
  for (const name of ['ffmpeg', 'ffprobe']) {
    let candidate = base[`HYPERFRAMES_${name.toUpperCase()}_PATH`] || base[`${name.toUpperCase()}_BIN`];
    if (!candidate) {
      try { candidate = name === 'ffmpeg' ? require('ffmpeg-static') : require('ffprobe-static').path; } catch {}
    }
    if (candidate && path.isAbsolute(candidate) && fs.existsSync(candidate)) env[`HYPERFRAMES_${name.toUpperCase()}_PATH`] = candidate;
  }
  if (base.VIDEO_BROWSER_PATH && !env.HYPERFRAMES_BROWSER_PATH) env.HYPERFRAMES_BROWSER_PATH = base.VIDEO_BROWSER_PATH;
  return env;
}
function cliPath() {
  const packageFile = path.join(root, 'node_modules/hyperframes/package.json');
  if (!fs.existsSync(packageFile)) throw new Error('NEED_CONFIG: run node scripts/studio.mjs setup in this skill folder');
  if (json(packageFile).version !== pinned) throw new Error(`HyperFrames version mismatch; run setup to restore ${pinned}`);
  return path.join(path.dirname(packageFile), 'bin/hyperframes.mjs');
}
function runSync(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `command exited ${result.status}`);
  return result.stdout;
}
async function run(bin, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`command exited ${code ?? signal}`)));
  });
}
function npmCLI() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [process.env.npm_execpath, path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js')];
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(directory, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    if (fs.existsSync(file)) {
      const real = fs.realpathSync(file);
      candidates.push(real.endsWith('.js') ? real : path.join(path.dirname(real), 'node_modules/npm/bin/npm-cli.js'));
    }
  }
  const found = candidates.find(p => p && p.endsWith('.js') && fs.existsSync(p));
  if (!found) throw new Error('NEED_CONFIG: npm not found. Install Node.js 22+ with npm, then rerun setup.');
  return found;
}
export function evaluateDoctor(report) {
  // Upstream `ok` also includes optional Docker/local voice/music checks. This
  // bundle uses local rendering + external narration, so gate its actual needs.
  const required = ['Node.js', 'FFmpeg', 'FFprobe', 'Chrome'];
  return required.every(name => report.checks?.some(check => check.name === name && check.ok === true));
}
export function doctor() {
  const checks = { node: { ok: Number(process.versions.node.split('.')[0]) >= 22, version: process.version } };
  let upstream;
  try {
    const raw = runSync(process.execPath, [cliPath(), 'doctor', '--json'], { cwd: root, env: runtimeEnv() });
    upstream = JSON.parse(raw);
    // Upstream doctor always exits 0: inspect the payload's required checks.
    checks.hyperframes = { ok: evaluateDoctor(upstream), version: pinned, report: upstream };
  } catch (e) { checks.hyperframes = { ok: false, error: e.message }; }
  return { ok: Object.values(checks).every(c => c.ok), scope: 'local-render-tools; not end-to-end production', checks,
    transcription: { ready: upstream?.checks?.some(c => c.name === 'whisper-cpp' && c.ok) === true,
      requiredWhen: 'Existing narration audio has no usable timed captions',
      next: 'See references/hyperframes.md; configure whisper.cpp or use existing timed captions.' },
    voice: { provider: 'Edge TTS', voice: 'zh-CN-XiaoxiaoNeural', credentialRequired: false,
      minimaxEnvironmentCredentialPresent: Boolean(process.env.MINIMAX_API_KEY),
      networkTested: false, note: 'Default for new projects; preserve confirmed voices in existing projects. Check optional Python dependency with tts.mjs doctor. MiniMax requires --provider minimax.' } };
}
async function setup() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('NEED_CONFIG: install Node.js 22+ first');
  await run(process.execPath, [npmCLI(), 'ci', '--no-audit', '--no-fund'], { cwd: root, env: runtimeEnv() });
  await run(process.execPath, [cliPath(), 'browser', 'ensure'], { cwd: root, env: runtimeEnv() });
  const report = doctor();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

export function prepare(input, out, dependencies = {}) {
  input = path.resolve(input); out = path.resolve(out);
  const source = validateScenes(json(input), { audio: true });
  if (fs.existsSync(out)) throw new Error('Output directory already exists; use a new --out to preserve prior work');
  const inspectAudio = dependencies.checkAudio || checkAudio;
  const gsapFile = dependencies.gsapFile || require.resolve('gsap/dist/gsap.min.js');
  let start = 0;
  // Validate everything before writing; never copy a partial input over an existing project.
  const scenes = source.scenes.map(scene => {
    const audioSource = path.resolve(path.dirname(input), scene.audioPath);
    const extension = path.extname(audioSource).toLowerCase();
    if (!['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(extension)) throw new Error(`${scene.id}: unsupported audio extension`);
    const audio = inspectAudio(audioSource);
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) throw new Error(`${scene.id}: invalid audio duration`);
    const captions = validateCaptions(scene, audio.duration);
    if (scene.assets !== undefined && (!Array.isArray(scene.assets) || !scene.assets.every(p => typeof p === 'string' && p.trim()))) {
      throw new Error(`${scene.id}: assets must be local file path strings`);
    }
    const assets = (scene.assets || []).map((file, i) => {
      const original = path.resolve(path.dirname(input), file);
      if (!fs.statSync(original).isFile()) throw new Error(`${scene.id}: asset is not a file`);
      return { original, target: `assets/media/${scene.id}-${i}${path.extname(file)}` };
    });
    const result = { ...scene, audioSource, audioPath: `assets/audio/shot-${scene.id}${extension}`,
      assetCopies: assets,
      start, duration: audio.duration, audioSha256: hash(fs.readFileSync(audioSource)),
      narrationSha256: hash(scene.narration), captions,
      captionTiming: captions ? 'supplied-timing; review-required' : 'NEED_ALIGN' };
    start += audio.duration;
    return result;
  });
  fs.mkdirSync(path.join(out, 'assets/audio'), { recursive: true });
  fs.mkdirSync(path.join(out, 'assets/vendor'), { recursive: true });
  fs.mkdirSync(path.join(out, 'assets/media'), { recursive: true });
  try {
    fs.copyFileSync(gsapFile, path.join(out, 'assets/vendor/gsap.min.js'));
    const media = [], captionsMarkup = [];
    for (const scene of scenes) {
      fs.copyFileSync(scene.audioSource, path.join(out, scene.audioPath));
      scene.assets = scene.assetCopies.map(asset => {
        fs.copyFileSync(asset.original, path.join(out, asset.target));
        return asset.target;
      });
      if (scene.viewer?.image) {
        // Preserve WorkBuddy's screenshot/long-image input without exposing local paths.
        scene.viewer = { ...scene.viewer };
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(scene.viewer.image);
        if (match) {
          const target = `assets/media/${scene.id}-viewer.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
          fs.writeFileSync(path.join(out, target), Buffer.from(match[2], 'base64'));
          scene.viewer.image = target;
        } else {
          const original = path.resolve(path.dirname(input), scene.viewer.image);
          const target = `assets/media/${scene.id}-viewer${path.extname(original)}`;
          fs.copyFileSync(original, path.join(out, target));
          scene.viewer.image = target;
        }
      }
      media.push(`<audio id="voice-${scene.id}" src="${scene.audioPath}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="10" data-volume="1"></audio>`);
      for (const [i, cue] of (scene.captions || []).entries()) {
        captionsMarkup.push(`<div id="caption-${scene.id}-${i}" class="clip caption" data-start="${scene.start + cue.start}" data-duration="${cue.end - cue.start}" data-track-index="20"><span>${html(cue.text)}</span></div>`);
      }
      delete scene.audioSource;
      delete scene.assetCopies;
    }
    save(path.join(out, 'storyboard.json'), { ...source, scenes });
    const timing = { title: source.title, engine: `hyperframes@${pinned}`, width: 1920, height: 1080, fps: 30,
      duration: start, captionsReady: scenes.every(s => s.captions), humanReview: 'NEED_CONFIRM',
      scenes: scenes.map(s => ({ id: s.id, start: s.start, duration: s.duration, audioPath: s.audioPath,
        audioSha256: s.audioSha256, narration: s.narration, captions: s.captions })) };
    save(path.join(out, 'timing.json'), timing);
    fs.writeFileSync(path.join(out, 'media.html'), media.join('\n') + '\n');
    fs.writeFileSync(path.join(out, 'captions.html'), captionsMarkup.join('\n') + '\n');
    fs.copyFileSync(path.join(root, 'assets/composition-starter.html'), path.join(out, 'composition-starter.html.template'));
    return { project: out, duration: start, scenes: scenes.length, captionsReady: timing.captionsReady,
      status: 'prepared-materials; agent must author index.html using bundled instructions', videoCreated: false };
  } catch (e) {
    // This call created the directory exclusively; do not leave a usable-looking partial project.
    fs.rmSync(out, { recursive: true, force: true });
    throw e;
  }
}

export function renderGate(project) {
  const timing = json(path.join(project, 'timing.json'));
  if (!timing.captionsReady) throw new Error('NEED_ALIGN: supply full timed captions before rendering');
  for (const scene of timing.scenes) {
    if (!validateCaptions(scene, scene.duration)) throw new Error(`${scene.id}: missing captions`);
    const audio = path.resolve(project, scene.audioPath);
    if (hash(fs.readFileSync(audio)) !== scene.audioSha256) throw new Error(`${scene.id}: audio changed; rebuild timing`);
  }
  if (!fs.existsSync(path.join(project, 'index.html'))) throw new Error('Author index.html first; prepared materials are not an animated video');
  return timing;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || (command !== 'cli' && args.includes('--help'))) {
    console.log('studio.mjs setup | doctor | prepare --input voiced-scenes.json --out NEW_DIR | cli --project DIR -- <command> [args]\nLocal CLI commands: lint, check, preview, snapshot, render, transcribe, browser, --help. No separate skills are installed.');
    return;
  }
  if (command === 'setup') return setup();
  if (command === 'doctor') { const report = doctor(); console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; return; }
  if (command === 'prepare') {
    const { values } = parseArgs({ args, options: { input: { type: 'string' }, out: { type: 'string' } } });
    if (!values.input || !values.out) throw new Error('--input and --out required');
    return console.log(JSON.stringify(prepare(values.input, values.out), null, 2));
  }
  if (command !== 'cli') throw new Error('Unknown command; use --help');
  const separator = args.indexOf('--');
  if (separator < 0) throw new Error('Use cli --project DIR -- <command> [args]');
  const { values } = parseArgs({ args: args.slice(0, separator), options: { project: { type: 'string' } } });
  if (!values.project) throw new Error('--project required');
  const project = path.resolve(values.project), cliArgs = args.slice(separator + 1);
  if (!['lint', 'check', 'preview', 'snapshot', 'render', 'transcribe', 'browser', '--help'].includes(cliArgs[0])) {
    throw new Error('Unsupported command; this bundle does not install skills, auto-update, publish, or call cloud rendering');
  }
  if (cliArgs[0] === 'render' && !cliArgs.includes('--help')) renderGate(project);
  await run(process.execPath, [cliPath(), ...cliArgs], { cwd: project, env: runtimeEnv() });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
