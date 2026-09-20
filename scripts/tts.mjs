#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { checkAudio } from './video.mjs';
import { validateScenes } from './scene-manifest.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE_VERSION = '7.2.8';
function provider(options) {
  const name = options.provider || 'edge';
  if (!['minimax', 'edge'].includes(name)) throw new Error('provider must be minimax or edge');
  return name;
}
function saveJSON(file, value) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
export function settings(options = {}) {
  if (provider(options) === 'edge') {
    if (options.model || options.region || options['key-file'] || options['keychain-service']) {
      throw new Error('Edge TTS does not use MiniMax model, region or credentials; use --provider minimax for an explicitly selected MiniMax voice, or remove those options');
    }
    const speed = Number(options.speed || 1);
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('speed must be 0.5–2');
    const voice = options.voice || 'zh-CN-XiaoxiaoNeural';
    if (!/^[a-z]{2,3}-[A-Z]{2}-.+Neural$/.test(voice)) throw new Error('Use an Edge voice ID from voices --provider edge; cloned MiniMax voices cannot be used with Edge');
    return { voice, model: `edge-tts-${EDGE_VERSION}`, speed };
  }
  const region = options.region || 'cn';
  if (!['cn', 'global'].includes(region)) throw new Error('region must be cn or global');
  const voice = options.voice || 'Chinese (Mandarin)_Warm_Bestie';
  const model = options.model || 'speech-2.8-hd';
  const speed = Number(options.speed || 1);
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('speed must be 0.5–2');
  return { region, voice, model, speed };
}
export function makePlan(source, options = {}) {
  validateScenes(source);
  const config = settings(options);
  for (const scene of source.scenes) {
    if (scene.audioPath) throw new Error(`${scene.id}: audioPath already set; use existing audio or create a separate text-only manifest`);
    if (Array.from(scene.narration).length >= 10000) throw new Error(`${scene.id}: narration must be below 10000 characters; do not truncate`);
  }
  const isEdge = provider(options) === 'edge';
  return { provider: isEdge ? 'Edge TTS' : 'MiniMax', config, fingerprint: hash(JSON.stringify({ source, config })),
    scenes: source.scenes.map(s => ({ id: s.id, textHash: hash(s.narration), characters: Array.from(s.narration).length })),
    totalCharacters: source.scenes.reduce((n, s) => n + Array.from(s.narration).length, 0),
    billing: isEdge ? 'No API key or per-call payment configured. Uses Microsoft online speech via third-party edge-tts; availability and unlimited usage are not guaranteed. No paid fallback.'
      : 'Online API usage is charged to the configured MiniMax account; WorkBuddy membership does not supply this credential.' };
}
function edgePython(options) {
  const local = path.join(skillRoot, '.edge-tts-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return options.python || process.env.EDGE_TTS_PYTHON || (fs.existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3');
}
function edgeCommand(args, options, run = spawnSync) {
  const result = run(edgePython(options), args, { encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`Edge TTS failed (${result.error?.code || `exit ${result.status}`}). Check Python, edge-tts==${EDGE_VERSION}, network and voice. No automatic retry or paid fallback. See references/tts.md.`);
  }
  return result.stdout;
}
export function edgeDoctor(options = {}) {
  const version = edgeCommand(['-c', 'import importlib.metadata; print(importlib.metadata.version("edge-tts"))'], options).trim();
  if (version !== EDGE_VERSION) throw new Error(`Expected edge-tts==${EDGE_VERSION}; found ${version}. Use the documented virtual environment.`);
  return { provider: 'Edge TTS', version, credentialRequired: false, networkTested: false };
}
export function synthesizeEdge(text, config, options = {}, run = spawnSync) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'training-edge-'));
  try {
    const input = path.join(temp, 'narration.txt'), output = path.join(temp, 'voice.mp3');
    fs.writeFileSync(input, text, { encoding: 'utf8', mode: 0o600 });
    const rate = Math.round((config.speed - 1) * 100);
    edgeCommand(['-m', 'edge_tts', '--file', input, '--voice', config.voice,
      `--rate=${rate >= 0 ? '+' : ''}${rate}%`, '--write-media', output], options, run);
    if (!fs.existsSync(output) || !fs.statSync(output).size) throw new Error('Edge TTS returned no audio; no paid fallback');
    return { bytes: fs.readFileSync(output) };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
export function loadKey(options = {}) {
  let key = process.env.MINIMAX_API_KEY || (options['key-file'] ? fs.readFileSync(path.resolve(options['key-file']), 'utf8').trim() : '');
  if (!key && options['keychain-service']) {
    if (process.platform !== 'darwin') throw new Error('--keychain-service is only available on macOS; use MINIMAX_API_KEY or --key-file');
    const result = spawnSync('security', ['find-generic-password', '-a', os.userInfo().username, '-s', options['keychain-service'], '-w'], { encoding: 'utf8', timeout: 30000 });
    if (result.status === 0) key = result.stdout.trim();
  }
  if (!key) throw new Error('NEED_CONFIG: set MINIMAX_API_KEY or use --key-file /private/path/minimax-key.txt. Do not paste keys into chat or put them in the Skill package.');
  return key;
}
async function post(route, config, key, payload, request = fetch) {
  const origin = config.region === 'cn' ? 'https://api.minimaxi.com' : 'https://api.minimax.io';
  let response;
  try {
    response = await request(`${origin}/v1/${route}`, { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(120000) });
  } catch { throw new Error('MiniMax request interrupted; billing outcome may be unknown. No automatic retry.'); }
  if (!response.ok) throw new Error(`MiniMax HTTP ${response.status}; check account, region, quota, and permissions`);
  let result;
  try { result = await response.json(); } catch { throw new Error('Invalid MiniMax JSON response'); }
  if (result.base_resp?.status_code !== 0) throw new Error(`MiniMax API error code ${Number(result.base_resp?.status_code)}; check voice/account settings`);
  return result;
}
export async function synthesize(text, config, key, request = fetch) {
  const response = await post('t2a_v2', config, key, {
    model: config.model, text, stream: false, output_format: 'hex',
    voice_setting: { voice_id: config.voice, speed: config.speed, vol: 1, pitch: 0 },
    audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 }
  }, request);
  const hex = response.data?.audio;
  if (typeof hex !== 'string' || !hex.length || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) throw new Error('Invalid audio hex from MiniMax');
  return { bytes: Buffer.from(hex, 'hex'), traceId: response.trace_id,
    usageCharacters: response.extra_info?.usage_characters };
}
export async function generate(source, out, options = {}, dependencies = {}) {
  const plan = makePlan(source, options);
  const isEdge = provider(options) === 'edge';
  const key = isEdge ? undefined : dependencies.key || loadKey(options);
  if (isEdge && !dependencies.edgeRun) edgeDoctor(options);
  const check = dependencies.checkAudio || checkAudio;
  const reportPath = path.join(out, 'tts-report.json');
  if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(reportPath)) throw new Error('Output directory not empty; choose a new --out');
  fs.mkdirSync(out, { recursive: true });
  const lock = path.join(out, '.tts.lock');
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx'); } catch { throw new Error('TTS is running or was interrupted. Inspect .tts.lock and tts-report.json before recovery; do not blindly retry.'); }
  try {
    const report = fs.existsSync(reportPath) ? readJSON(reportPath) : { ...plan, results: [], humanReview: 'NEED_CONFIRM' };
    if (report.fingerprint !== plan.fingerprint) throw new Error('Inputs/voice changed; choose a new --out directory');
    saveJSON(reportPath, report);
    for (const scene of source.scenes) {
      const file = path.join(out, `shot-${scene.id}.mp3`);
      let record = report.results.find(r => r.id === scene.id);
      if (record?.status === 'generated') {
        if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== record.sha256) throw new Error(`${scene.id}: generated audio changed or missing; refusing automatic regeneration`);
        check(file);
        continue;
      }
      if (record) throw new Error(`${scene.id}: previous request incomplete; inspect report before starting a new output directory; MiniMax requests may incur another charge`);
      if (fs.existsSync(file)) throw new Error(`${scene.id}: untracked audio exists; refusing overwrite`);
      record = { id: scene.id, textHash: hash(scene.narration), status: 'request_pending' };
      report.results.push(record); saveJSON(reportPath, report);
      try {
        const audio = isEdge ? synthesizeEdge(scene.narration, plan.config, options, dependencies.edgeRun)
          : await synthesize(scene.narration, plan.config, key, dependencies.request);
        fs.writeFileSync(file, audio.bytes, { flag: 'wx' });
        const media = check(file);
        Object.assign(record, { status: 'generated', ...media, traceId: audio.traceId, usageCharacters: audio.usageCharacters });
        saveJSON(reportPath, report);
      } catch (e) {
        record.status = 'needs_review'; record.error = e.message; saveJSON(reportPath, report); throw e;
      }
    }
    const manifest = { ...source, scenes: source.scenes.map(s => ({ ...s,
      captions: undefined, captionTiming: 'NEED_ALIGN',
      audioPath: `shot-${s.id}.mp3`, audioContentCheck: `${plan.provider} generated from exact narration; listening review NEED_CONFIRM` })) };
    const manifestPath = path.join(out, 'voiced-scenes.json');
    saveJSON(manifestPath, manifest);
    report.status = 'audio_generated'; saveJSON(reportPath, report);
    return { manifestPath, reportPath, scenes: source.scenes.length, humanReview: report.humanReview };
  } finally { fs.closeSync(lockFd); fs.unlinkSync(lock); }
}
async function main() {
  const { values: options, positionals } = parseArgs({ allowPositionals: true, options: {
    provider: { type: 'string' }, python: { type: 'string' },
    input: { type: 'string' }, out: { type: 'string' }, voice: { type: 'string' }, model: { type: 'string' },
    speed: { type: 'string' }, region: { type: 'string' }, 'key-file': { type: 'string' }, 'keychain-service': { type: 'string' }, help: { type: 'boolean' }
  } });
  const command = positionals[0];
  if (!command || options.help) return console.log('tts.mjs plan --input scenes.json [--voice ID] | generate --input scenes.json --out DIR | voices | doctor\nShared: --provider edge|minimax (default edge, zh-CN-XiaoxiaoNeural) --voice ID --speed 1\nMiniMax: --provider minimax --region cn|global --model speech-2.8-hd --key-file FILE\nEdge: --python PATH (optional Python executable with edge-tts==7.2.8). No API key. plan makes no API calls.');
  if (provider(options) === 'edge' && ['doctor', 'voices'].includes(command)) {
    settings(options);
    const result = edgeDoctor(options);
    if (command === 'doctor') return console.log(JSON.stringify(result));
    return console.log(edgeCommand(['-m', 'edge_tts', '--list-voices'], options));
  }
  if (command === 'doctor') { loadKey(options); return console.log(JSON.stringify({ credentialPresent: true, networkTested: false, ...settings(options) })); }
  if (command === 'voices') {
    const response = await post('get_voice', settings(options), loadKey(options), { voice_type: 'system' });
    return console.log(JSON.stringify(response.system_voice?.map(v => ({ id: v.voice_id, name: v.voice_name, description: v.description })) || [], null, 2));
  }
  if (!['plan', 'generate'].includes(command) || !options.input) throw new Error('Use --help for commands');
  const source = readJSON(path.resolve(options.input));
  if (command === 'plan') return console.log(JSON.stringify(makePlan(source, options), null, 2));
  if (!options.out) throw new Error('--out required');
  console.log(JSON.stringify(await generate(source, path.resolve(options.out), options), null, 2));
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
