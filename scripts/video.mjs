#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300000 });
  if (r.error || r.status !== 0) throw new Error(`${path.basename(bin)}: ${r.error?.message || r.stderr.slice(-2000)}`);
  return r.stdout;
}
function binary(name) {
  const explicit = process.env[name.toUpperCase() + '_BIN'];
  if (explicit) { run(explicit, ['-version']); return explicit; }
  if (spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0) return name;
  try {
    const candidate = name === 'ffmpeg' ? require('ffmpeg-static') : require('ffprobe-static').path;
    run(candidate, ['-version']); return candidate;
  } catch { throw new Error(`NEED_CONFIG: ${name}; install dependencies with npm ci or set ${name.toUpperCase()}_BIN`); }
}
function probe(file) {
  return JSON.parse(run(binary('ffprobe'), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]));
}
export function checkAudio(file) {
  const media = probe(file);
  const duration = Number(media.format.duration);
  if (!media.streams.some(s => s.codec_type === 'audio') || !(duration > 0)) throw new Error('Invalid audio');
  run(binary('ffmpeg'), ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-']);
  return { duration, sha256: hash(fs.readFileSync(file)) };
}
export function validate(data) {
  if (typeof data.title !== 'string' || !data.title.trim() || !Array.isArray(data.scenes) || !data.scenes.length) throw new Error('title and nonempty scenes required');
  const ids = new Set();
  for (const scene of data.scenes) {
    for (const field of ['id', 'chapter', 'title', 'narration', 'input', 'action', 'output', 'humanCheckpoint', 'audioPath']) {
      if (typeof scene[field] !== 'string' || !scene[field].trim()) throw new Error(`${scene.id}: missing ${field}`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(scene.id) || ids.has(scene.id)) throw new Error(`invalid/duplicate id: ${scene.id}`);
    ids.add(scene.id);
    if (!['extract', 'pipeline', 'boundary'].includes(scene.visualType)) throw new Error(`${scene.id}: supported visualType: extract, pipeline, boundary`);
    if (!scene.viewer || typeof scene.viewer !== 'object') throw new Error(`${scene.id}: viewer required`);
    if (/制作规则|本镜头动作|画面必须看懂|productionNote/.test(JSON.stringify(scene.viewer) + scene.title)) throw new Error(`${scene.id}: production notes in viewer text`);
    if (!Array.isArray(scene.viewer.items) || scene.viewer.items.length < 1 || scene.viewer.items.length > 6 || !scene.viewer.items.every(x=>typeof x === 'string' && x.trim())) throw new Error(`${scene.id}: viewer.items needs 1–6 strings`);
    for (const key of ['headline', 'leftTitle', 'rightTitle', 'inputText', 'result', 'checkpoint']) {
      if (typeof scene.viewer[key] !== 'string') throw new Error(`${scene.id}: viewer.${key} required`);
    }
  }
  return data;
}
export function captionParts(narration, limit = 28) {
  const parts = narration.match(/[^，。！？；：、,.!?;:]+[，。！？；：、,.!?;:]?|[，。！？；：、,.!?;:]/gu) || [narration];
  const result = [];
  let current = '';
  for (const part of parts) {
    if (Array.from(current + part).length <= limit) current += part;
    else {
      if (current) result.push(current);
      const chars = Array.from(part);
      while (chars.length > limit) result.push(chars.splice(0, limit).join(''));
      current = chars.join('');
    }
  }
  if (current) result.push(current);
  return result;
}
function prepare(input) {
  const source = validate(readJSON(input));
  const scenes = source.scenes.map(scene => {
    const audioPath = path.resolve(path.dirname(input), scene.audioPath);
    const bytes = fs.readFileSync(audioPath);
    const media = probe(audioPath);
    const duration = Number(media.format.duration);
    if (!media.streams.some(s => s.codec_type === 'audio') || !(duration > 0)) throw new Error(`${scene.id}: invalid audio`);
    const parts = captionParts(scene.narration);
    let cursor = 0;
    const total = parts.reduce((n, s) => n + Array.from(s).length, 0);
    const captions = parts.map(text => {
      const start = cursor; cursor += duration * Array.from(text).length / total;
      return { text, start, end: cursor };
    });
    return { ...scene, audioHash: hash(bytes), narrationHash: hash(scene.narration), duration, captions,
      audioData: `data:${path.extname(audioPath).toLowerCase() === '.wav' ? 'audio/wav' : 'audio/mpeg'};base64,${bytes.toString('base64')}` };
  });
  const template = fs.readFileSync(path.join(skillRoot, 'assets/player.html'), 'utf8');
  const fingerprint = hash(JSON.stringify({ source, audio: scenes.map(s=>s.audioHash), template }));
  // Only these fields can reach the viewer. Maker notes and source paths stay out of the HTML.
  const viewerData = { title: source.title, scenes: scenes.map(s=>({ id:s.id, chapter:s.chapter, title:s.title,
    visualType:s.visualType, viewer:s.viewer, duration:s.duration, captions:s.captions, audioData:s.audioData })) };
  return { fingerprint, scenes, html: template.replace('/*__VIDEO_DATA__*/null', JSON.stringify(viewerData).replace(/</g, '\\u003c')) };
}
async function browser(options) {
  const { chromium } = await import('playwright');
  const launch = { headless:true, args:['--autoplay-policy=no-user-gesture-required'] };
  if (options.browser || process.env.VIDEO_BROWSER_PATH) launch.executablePath = options.browser || process.env.VIDEO_BROWSER_PATH;
  else launch.channel = options.channel || 'chrome';
  return chromium.launch(launch);
}
async function doctor(options) {
  const result = { node:process.version, platform:process.platform, arch:process.arch, checks:{} };
  for (const name of ['ffmpeg','ffprobe']) {
    try { result.checks[name] = { ok:true, path:binary(name) }; } catch(e) { result.checks[name] = { ok:false, error:e.message }; }
  }
  try {
    const b = await browser(options);
    try {
      const p = await b.newPage();
      result.checks.browser = await p.evaluate(()=>({ ok:true, canvasCapture:typeof document.createElement('canvas').captureStream === 'function',
        recorder:typeof MediaRecorder !== 'undefined', mimeTypes:['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].filter(x=>MediaRecorder.isTypeSupported(x)) }));
    } finally { await b.close(); }
  } catch(e) { result.checks.browser = { ok:false,error:e.message }; }
  result.ok = Object.values(result.checks).every(x=>x.ok) && result.checks.browser.canvasCapture && result.checks.browser.mimeTypes?.length > 0;
  console.log(JSON.stringify(result,null,2));
  if (!result.ok) process.exitCode = 1;
}
function verify(file, expected) {
  const media = probe(file);
  const video = media.streams.find(x=>x.codec_type === 'video');
  const audio = media.streams.find(x=>x.codec_type === 'audio');
  if (!video || !audio) throw new Error('Missing audio or video stream');
  const duration = Number(media.format.duration);
  if (expected && Math.abs(duration-expected) > Math.max(1,expected * .02)) throw new Error(`Duration mismatch: ${duration} vs ${expected}`);
  run(binary('ffmpeg'), ['-v','error','-xerror','-i',file,'-f','null','-']);
  return { decode:'passed',duration,video:{codec:video.codec_name,width:video.width,height:video.height,fps:video.avg_frame_rate},
    audio:{codec:audio.codec_name,sampleRate:audio.sample_rate},fileHash:hash(fs.readFileSync(file)) };
}
async function produce(command, options) {
  if (!options.input || !options.out) throw new Error('--input manifest.json and --out output-directory required');
  const input = path.resolve(options.input), out = path.resolve(options.out);
  const data = prepare(input);
  const reportPath = path.join(out,'report.json');
  const existing = fs.existsSync(reportPath) ? readJSON(reportPath) : null;
  if (existing && existing.fingerprint !== data.fingerprint) throw new Error('Inputs changed. Choose a new --out directory; existing confirmed assets are preserved.');
  if (!existing && fs.existsSync(out) && fs.readdirSync(out).length) throw new Error('Output directory not empty; choose a new --out directory.');
  fs.mkdirSync(out,{recursive:true});
  const report = existing || { version:'0.4.0',fingerprint:data.fingerprint,shots:data.scenes.map(s=>({id:s.id,duration:s.duration,audioHash:s.audioHash,narrationHash:s.narrationHash,contentCheck:s.audioContentCheck || 'NEED_CONFIRM'})),
    expectedDuration:data.scenes.reduce((n,s)=>n+s.duration,0),captionTiming:'proportional-estimate; human sync review required',humanReview:'NEED_CONFIRM',status:'built' };
  const html=path.join(out,'index.html'), webm=path.join(out,'recording.webm'), mp4=path.join(out,'sample.mp4');
  fs.writeFileSync(html,data.html); saveJSON(reportPath,report);
  if (command === 'build') { console.log(JSON.stringify({html,reportPath})); return; }
  if (report.status === 'verified' && fs.existsSync(mp4)) {
    const check = verify(mp4,report.expectedDuration);
    if (check.fileHash !== report.media.fileHash) throw new Error('Existing MP4 changed since verification');
    console.log(JSON.stringify({status:'reused_verified',mp4,reportPath})); return;
  }
  try {
    if (report.recordingHash && fs.existsSync(webm)) {
      if (hash(fs.readFileSync(webm)) !== report.recordingHash) throw new Error('Recorded WebM changed; refusing resume');
      report.resumedFromWebm = true;
    } else {
      const b = await browser(options);
      try {
        const p = await b.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
        await p.goto(pathToFileURL(html).href);
        await p.waitForFunction(()=>window.videoReady === true);
        const layout = await p.evaluate(()=>window.checkLayout());
        if (layout.errors.length) throw new Error(`Layout overflow: ${layout.errors.join('; ')}`);
        report.layout = layout;
        for(let i=0;i<data.scenes.length;i++) {
          await p.evaluate(index=>window.showFrame(index,.85),i);
          await p.locator('canvas').screenshot({path:path.join(out,`layout-${data.scenes[i].id}.png`)});
        }
        const timeout = Number(options.timeout || Math.ceil(report.expectedDuration*2000+60000));
        const download = p.waitForEvent('download',{timeout});
        // Handle download rejection immediately while recording is in progress.
        download.catch(()=>{});
        await p.evaluate(()=>window.startVideo(true));
        await p.waitForFunction(()=>window.videoDone === true,null,{timeout});
        const error = await p.evaluate(()=>window.videoError);
        if(error) throw new Error(error);
        const artifact = await download; await artifact.saveAs(webm);
        report.timeline = await p.evaluate(()=>window.videoTimeline);
        report.recordingHash = hash(fs.readFileSync(webm));
        report.status='recorded'; saveJSON(reportPath,report);
      } finally { await b.close(); }
    }
    if (options['record-only']) { console.log(JSON.stringify({status:'recorded',webm,reportPath}));return; }
    run(binary('ffmpeg'),['-y','-v','error','-i',webm,'-c:v','libx264','-pix_fmt','yuv420p','-r','30','-c:a','aac','-ar','48000','-b:a','128k','-movflags','+faststart',mp4]);
    report.media = verify(mp4,report.expectedDuration);
    // Actual MP4 frames, not only browser previews.
    for(const [i,segment] of report.timeline.entries()) {
      const t=segment.start+(segment.end-segment.start)*.85;
      run(binary('ffmpeg'),['-y','-v','error','-ss',String(t),'-i',mp4,'-frames:v','1',path.join(out,`video-${data.scenes[i].id}.png`)]);
    }
    report.status='verified'; delete report.error;saveJSON(reportPath,report);
    console.log(JSON.stringify({status:report.status,mp4,html,reportPath,duration:report.media.duration,humanReview:report.humanReview}));
  } catch(e) { report.error=e.message;saveJSON(reportPath,report);throw e; }
}
async function main() {
  const { values:options,positionals }=parseArgs({allowPositionals:true,options:{ input:{type:'string'},out:{type:'string'},file:{type:'string'},browser:{type:'string'},channel:{type:'string'},timeout:{type:'string'},'record-only':{type:'boolean'},help:{type:'boolean'} }});
  const command=positionals[0];
  if(options.help || !command) return console.log('node scripts/video.mjs doctor | build --input manifest.json --out DIR | render --input manifest.json --out DIR [--record-only] | verify --file video.mp4\nBrowser: --channel chrome (default), --channel chromium, or --browser executable. Tools: FFMPEG_BIN / FFPROBE_BIN.');
  if(command==='doctor')return doctor(options);
  if(command==='build' || command==='render')return produce(command,options);
  if(command==='verify' && options.file)return console.log(JSON.stringify(verify(path.resolve(options.file)),null,2));
  throw new Error('Unknown command or missing --file. Use --help.');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{ console.error(e.message);process.exitCode=1; });
