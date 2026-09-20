import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makePlan, generate, synthesize, settings } from './tts.mjs';

const source = () => ({ title: '演示', scenes: [{ id: '01', chapter: '演示', title: '核对资料',
  narration: '核对原文。\n不要删改！', input: '原文', action: '核对', output: '清单', humanCheckpoint: '核对内容',
  visualType: 'pipeline', viewer: { headline: '核对资料', leftTitle: '输入', rightTitle: '输出',
    inputText: '原文', items: ['读取', '核对'], result: '清单', checkpoint: '核对内容' } }] });
const ok = audio => ({ ok: true, json: async () => ({ base_resp: { status_code: 0 }, data: { audio } }) });
test('exact narration sent; invalid responses and API failures rejected without secrets', async () => {
  const text = source().scenes[0].narration;
  await synthesize(text, settings(), 'private-test-key', async (url, init) => {
    assert.equal(JSON.parse(init.body).text, text);
    assert.equal(url, 'https://api.minimaxi.com/v1/t2a_v2');
    return ok('494433');
  });
  await assert.rejects(synthesize(text, settings(), 'private-test-key', async () => ok('zz')), /Invalid audio/);
  await assert.rejects(synthesize(text, settings(), 'private-test-key', async () => ({ ok: false, status: 401 })), /HTTP 401/);
});
test('resume avoids duplicate billing; changed text/audio rejected; source preserved', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'video-tts-test-'));
  const data = source(), before = JSON.stringify(data);
  let calls = 0;
  const deps = { key: 'private-test-key', request: async () => { calls++; return ok('494433'); },
    checkAudio: file => ({ duration: 1, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }) };
  try {
    await generate(data, out, {}, deps);
    await generate(data, out, {}, deps);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(data), before);
    const changed = source(); changed.scenes[0].narration += '变更';
    await assert.rejects(generate(changed, out, {}, deps), /Inputs\/voice changed/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'voiced-scenes.json'))).scenes[0].narration, data.scenes[0].narration);
    assert.ok(!fs.readFileSync(path.join(out, 'tts-report.json'), 'utf8').includes('private-test-key'));
    fs.writeFileSync(path.join(out, 'shot-01.mp3'), 'changed');
    await assert.rejects(generate(data, out, {}, deps), /audio changed/);
    assert.equal(calls, 1);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
test('uncertain request is not automatically charged again', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'video-tts-failure-'));
  let calls = 0;
  const deps = { key: 'private-test-key', request: async () => { calls++; throw new Error('network private-test-key'); } };
  try {
    await assert.rejects(generate(source(), out, {}, deps), /No automatic retry/);
    await assert.rejects(generate(source(), out, {}, deps), /previous request incomplete/);
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
    await generate(data, out, {}, { key: 'private-test-key', request: async () => ok('494433'),
      checkAudio: file => ({ duration: 1, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }) });
    const scene = JSON.parse(fs.readFileSync(path.join(out, 'voiced-scenes.json'))).scenes[0];
    assert.equal(scene.captions, undefined);
    assert.equal(scene.captionTiming, 'NEED_ALIGN');
    assert.equal(data.scenes[0].captions[0].end, 99);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
