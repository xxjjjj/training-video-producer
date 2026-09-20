import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepare, renderGate, runtimeEnv, evaluateDoctor } from './studio.mjs';
import { validateCaptions } from './scene-manifest.mjs';
import { makePlan } from './tts.mjs';

function source() {
  return { title: '完整动画', scenes: [{ id: '01', chapter: '第一章', title: '数据进入表单',
    narration: '先提取，再核对。', input: '邮件', action: '提取移动并核对', output: '表单', humanCheckpoint: '核对结果',
    visualBrief: '自由 DOM 动画，不使用旧模板', audioPath: '声音 样本.mp3',
    captions: [{ text: '先提取，', start: 0, end: 1 }, { text: '再核对。', start: 1, end: 2 }] }] };
}
function fixture(t, data = source()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '培训技能 测试-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, '分镜.json'), out = path.join(dir, '动画 工程');
  // Stub bytes are never played or exported. Probe is injected for isolated mapping tests.
  fs.writeFileSync(path.join(dir, '声音 样本.mp3'), 'test-only-media-bytes');
  fs.writeFileSync(path.join(dir, 'gsap.js'), '// test fixture');
  fs.writeFileSync(input, JSON.stringify(data));
  return { dir, input, out, deps: { gsapFile: path.join(dir, 'gsap.js'), checkAudio: () => ({ duration: 2 }) } };
}

test('TTS accepts a freeform animation storyboard without old template fields', () => {
  const data = source(); delete data.scenes[0].audioPath;
  assert.equal(makePlan(data).scenes.length, 1);
  assert.equal(makePlan(data).totalCharacters, Array.from(data.scenes[0].narration).length);
});

test('setup --help only prints usage and never starts npm or browser installation', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./studio.mjs', import.meta.url)), 'setup', '--help'],
    { encoding: 'utf8', timeout: 3000, env: { ...process.env, PATH: '', npm_execpath: '/nonexistent/npm-cli.js' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /studio.mjs setup/);
  assert.doesNotMatch(result.stdout, /added \d+ packages|Downloading/);
});

test('prepare preserves exact text and order, maps real durations, escapes captions, relocates assets', t => {
  const data = source();
  data.scenes.push({ ...data.scenes[0], id: '02', narration: '<客户>。', captions: [{ text: '<客户>。', start: 0, end: 2 }] });
  data.scenes[0].viewer = { image: 'data:image/png;base64,aGVsbG8=', imageFullscreen: true };
  data.scenes[1].assets = ['截图 中文.svg'];
  const f = fixture(t, data), before = fs.readFileSync(f.input);
  fs.writeFileSync(path.join(f.dir, '截图 中文.svg'), '<svg/>');
  const result = prepare(f.input, f.out, f.deps);
  assert.equal(result.videoCreated, false); assert.equal(result.duration, 4);
  assert.deepEqual(fs.readFileSync(f.input), before);
  const story = JSON.parse(fs.readFileSync(path.join(f.out, 'storyboard.json')));
  assert.deepEqual(story.scenes.map(s => [s.id, s.start, s.narration]), [['01', 0, data.scenes[0].narration], ['02', 2, '<客户>。']]);
  assert.equal(story.scenes[0].viewer.imageFullscreen, true);
  assert.ok(fs.existsSync(path.join(f.out, story.scenes[0].viewer.image)));
  assert.ok(fs.existsSync(path.join(f.out, story.scenes[1].assets[0])));
  assert.match(fs.readFileSync(path.join(f.out, 'captions.html'), 'utf8'), /&lt;客户&gt;/);
  assert.match(fs.readFileSync(path.join(f.out, 'media.html'), 'utf8'), /id="voice-02".*data-start="2"/);
  assert.ok(!fs.existsSync(path.join(f.out, 'index.html')));
  assert.ok(fs.existsSync(path.join(f.out, 'composition-starter.html.template')));
  assert.ok(!fs.existsSync(path.join(f.out, 'composition-starter.html')));
  assert.throws(() => prepare(f.input, f.out, f.deps), /already exists/);
  const moved = path.join(f.dir, '另一处'); fs.renameSync(f.out, moved);
  fs.writeFileSync(path.join(moved, 'index.html'), '<!doctype html>');
  assert.equal(renderGate(moved).duration, 4);
  fs.writeFileSync(path.join(moved, story.scenes[0].audioPath), 'changed');
  assert.throws(() => renderGate(moved), /audio changed/);
});

test('missing subtitles remain NEED_ALIGN and cannot render, malformed cues rejected before writing', t => {
  const data = source(); delete data.scenes[0].captions;
  const f = fixture(t, data); const result = prepare(f.input, f.out, f.deps);
  assert.equal(result.captionsReady, false);
  assert.throws(() => renderGate(f.out), /NEED_ALIGN/);
  for (const cues of [[], [{ text: '删减', start: 0, end: 1 }], [{ text: data.scenes[0].narration, start: 0, end: 3 }]]) {
    assert.throws(() => validateCaptions({ ...data.scenes[0], captions: cues }, 2));
  }
  const bad = source(); bad.scenes[0].captions[1].start = 0.5;
  fs.writeFileSync(f.input, JSON.stringify(bad));
  const out = path.join(f.dir, 'bad');
  assert.throws(() => prepare(f.input, out, f.deps), /invalid caption/);
  assert.ok(!fs.existsSync(out));
});

test('unsafe or duplicate IDs cannot escape the output directory', t => {
  const data = source(); data.scenes[0].id = '../escape';
  const f = fixture(t, data);
  assert.throws(() => prepare(f.input, f.out, f.deps), /invalid\/duplicate id/);
  assert.ok(!fs.existsSync(f.out));
});

test('runtime suppresses external skill installation and upgrade without changing parent environment', () => {
  const base = { PATH: 'example', HYPERFRAMES_SKIP_SKILLS: '0' };
  const env = runtimeEnv(base);
  assert.equal(env.HYPERFRAMES_SKIP_SKILLS, '1');
  assert.equal(env.HYPERFRAMES_NO_AUTO_INSTALL, '1');
  assert.equal(env.HYPERFRAMES_NO_TELEMETRY, '1');
  assert.equal(base.HYPERFRAMES_SKIP_SKILLS, '0');
});

test('doctor gates local rendering requirements, never optional Docker or paid/local voice providers', () => {
  const checks = ['Node.js', 'FFmpeg', 'FFprobe', 'Chrome'].map(name => ({ name, ok: true }));
  assert.equal(evaluateDoctor({ ok: false, checks: [...checks, { name: 'Docker running', ok: false }] }), true);
  assert.equal(evaluateDoctor({ ok: true, checks: checks.filter(c => c.name !== 'Chrome') }), false);
  checks[1].ok = false;
  assert.equal(evaluateDoctor({ ok: true, checks }), false);
});
