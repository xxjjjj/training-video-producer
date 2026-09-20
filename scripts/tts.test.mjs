import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makePlan, generate, synthesize, synthesizeEdge, settings } from './tts.mjs';

const source = () => ({ title: '演示', scenes: [{ id: '01', chapter: '演示', title: '核对资料',
  narration: '核对原文。\n不要删改！', input: '原文', action: '核对', output: '清单', humanCheckpoint: '核对内容',
  visualType: 'pipeline', viewer: { headline: '核对资料', leftTitle: '输入', rightTitle: '输出',
    inputText: '原文', items: ['读取', '核对'], result: '清单', checkpoint: '核对内容' } }] });
const ok = audio => ({ ok: true, json: async () => ({ base_resp: { status_code: 0 }, data: { audio } }) });
test('CLI executes when the installed skill is reached through a symlink', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-tts-link-'));
  try {
    const link = path.join(dir, 'tts.mjs');
    fs.symlinkSync(fileURLToPath(new URL('./tts.mjs', import.meta.url)), link);
    const input = path.join(dir, 'scenes.json');
    fs.writeFileSync(input, JSON.stringify(source()));
    const result = spawnSync(process.execPath, [link, 'plan', '--input', input], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).provider, 'Edge TTS');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('free Xiaoxiao is default and paid options require explicit provider', () => {
  assert.equal(makePlan(source()).provider, 'Edge TTS');
  assert.equal(makePlan(source()).config.voice, 'zh-CN-XiaoxiaoNeural');
  assert.equal(makePlan(source(), { provider: 'minimax' }).provider, 'MiniMax');
  const plan = makePlan(source(), { provider: 'edge' });
  assert.equal(plan.provider, 'Edge TTS');
  assert.equal(plan.config.voice, 'zh-CN-XiaoxiaoNeural');
  assert.notEqual(plan.fingerprint, makePlan(source(), { provider: 'minimax' }).fingerprint);
  assert.throws(() => settings({ provider: 'unknown' }), /provider must/);
  assert.throws(() => settings({ provider: 'edge', model: 'speech-2.8-hd' }), /does not use/);
  assert.throws(() => settings({ provider: 'edge', voice: 'private-clone' }), /Edge voice ID/);
});
test('Edge preserves full UTF-8 narration, uses argument arrays and cleans temporary files', () => {
  const text = '完整原稿："你好"。\n$() `字` & <测试>！';
  let tempFile;
  const audio = synthesizeEdge(text, settings({ provider: 'edge', speed: '0.8' }), { python: '/path with spaces/python' }, (bin, args) => {
    assert.equal(bin, '/path with spaces/python');
    tempFile = args[args.indexOf('--file') + 1];
    assert.equal(fs.readFileSync(tempFile, 'utf8'), text);
    assert.ok(args.includes('--rate=-20%'));
    fs.writeFileSync(args[args.indexOf('--write-media') + 1], 'ID3');
    return { status: 0, stdout: '' };
  });
  assert.equal(audio.bytes.toString(), 'ID3');
  assert.ok(!fs.existsSync(tempFile));
});
test('Default generation resumes without credentials or paid requests and invalidates captions', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'video-edge-test-'));
  const data = source(); data.scenes[0].captions = [{ text: 'old', start: 0, end: 99 }];
  const before = JSON.stringify(data);
  let calls = 0;
  const deps = { request: () => { throw new Error('MUST NOT CALL PAID API'); }, edgeRun: (bin, args) => {
    calls++;
    fs.writeFileSync(args[args.indexOf('--write-media') + 1], 'ID3');
    return { status: 0, stdout: '' };
  }, checkAudio: file => ({ duration: 1, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }) };
  try {
    await generate(data, out, {}, deps);
    await generate(data, out, {}, deps);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(data), before);
    const scene = JSON.parse(fs.readFileSync(path.join(out, 'voiced-scenes.json'))).scenes[0];
    assert.equal(scene.narration, data.scenes[0].narration);
    assert.equal(scene.captions, undefined);
    assert.equal(scene.captionTiming, 'NEED_ALIGN');
    await assert.rejects(generate(data, out, { provider: 'edge', voice: 'zh-CN-YunxiNeural' }, deps), /Inputs\/voice changed/);
    assert.equal(calls, 1);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
test('Edge failure stops without retry or switching to paid service', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'video-edge-failure-'));
  let calls = 0, tempFile;
  const deps = { request: () => { throw new Error('MUST NOT CALL PAID API'); }, edgeRun: (bin, args) => {
    calls++; tempFile = args[args.indexOf('--file') + 1];
    return { status: 1, stderr: 'private narration must not appear in report' };
  } };
  try {
    await assert.rejects(generate(source(), out, {}, deps), /No automatic retry or paid fallback/);
    await assert.rejects(generate(source(), out, {}, deps), /previous request incomplete/);
    assert.equal(calls, 1);
    assert.ok(!fs.existsSync(tempFile));
    const report = fs.readFileSync(path.join(out, 'tts-report.json'), 'utf8');
    assert.ok(!report.includes('private narration'));
    assert.equal(JSON.parse(report).results[0].status, 'needs_review');
    assert.ok(!fs.existsSync(path.join(out, 'voiced-scenes.json')));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
test('exact narration sent; invalid responses and API failures rejected without secrets', async () => {
  const text = source().scenes[0].narration;
  await synthesize(text, settings({ provider: 'minimax' }), 'private-test-key', async (url, init) => {
    assert.equal(JSON.parse(init.body).text, text);
    assert.equal(url, 'https://api.minimaxi.com/v1/t2a_v2');
    return ok('494433');
  });
  await assert.rejects(synthesize(text, settings({ provider: 'minimax' }), 'private-test-key', async () => ok('zz')), /Invalid audio/);
  await assert.rejects(synthesize(text, settings({ provider: 'minimax' }), 'private-test-key', async () => ({ ok: false, status: 401 })), /HTTP 401/);
});
test('resume avoids duplicate billing; changed text/audio rejected; source preserved', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'video-tts-test-'));
  const data = source(), before = JSON.stringify(data);
  let calls = 0;
  const deps = { key: 'private-test-key', request: async () => { calls++; return ok('494433'); },
    checkAudio: file => ({ duration: 1, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }) };
  try {
    await generate(data, out, { provider: 'minimax' }, deps);
    await generate(data, out, { provider: 'minimax' }, deps);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(data), before);
    const changed = source(); changed.scenes[0].narration += '变更';
    await assert.rejects(generate(changed, out, { provider: 'minimax' }, deps), /Inputs\/voice changed/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'voiced-scenes.json'))).scenes[0].narration, data.scenes[0].narration);
    assert.ok(!fs.readFileSync(path.join(out, 'tts-report.json'), 'utf8').includes('private-test-key'));
    fs.writeFileSync(path.join(out, 'shot-01.mp3'), 'changed');
    await assert.rejects(generate(data, out, { provider: 'minimax' }, deps), /audio changed/);
    assert.equal(calls, 1);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
test('uncertain request is not automatically charged again', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'video-tts-failure-'));
  let calls = 0;
  const deps = { key: 'private-test-key', request: async () => { calls++; throw new Error('network private-test-key'); } };
  try {
    await assert.rejects(generate(source(), out, { provider: 'minimax' }, deps), /No automatic retry/);
    await assert.rejects(generate(source(), out, { provider: 'minimax' }, deps), /previous request incomplete/);
    assert.equal(calls, 1);
    assert.ok(!fs.readFileSync(path.join(out, 'tts-report.json'), 'utf8').includes('private-test-key'));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
test('existing audio and oversized narration are not silently replaced or truncated', () => {
  const existing = source(); existing.scenes[0].audioPath = 'existing.mp3';
  assert.throws(() => makePlan(existing), /audioPath already set/);
  const long = source(); long.scenes[0].narration = '字'.repeat(10000);
  assert.throws(() => makePlan(long), /below 10000/);
});

test('new narration audio invalidates old caption timing without modifying the source', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'video-tts-captions-'));
  const data = source(); data.scenes[0].captions = [{ text: data.scenes[0].narration, start: 0, end: 99 }];
  try {
    await generate(data, out, { provider: 'minimax' }, { key: 'private-test-key', request: async () => ok('494433'),
      checkAudio: file => ({ duration: 1, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }) });
    const scene = JSON.parse(fs.readFileSync(path.join(out, 'voiced-scenes.json'))).scenes[0];
    assert.equal(scene.captions, undefined);
    assert.equal(scene.captionTiming, 'NEED_ALIGN');
    assert.equal(data.scenes[0].captions[0].end, 99);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
