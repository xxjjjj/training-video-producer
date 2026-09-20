// Shared narration contract, deliberately independent of any visual template.
export function validateScenes(data, { audio = false } = {}) {
  if (typeof data?.title !== 'string' || !data.title.trim() || !Array.isArray(data.scenes) || !data.scenes.length) {
    throw new Error('title and nonempty scenes required');
  }
  const ids = new Set();
  for (const scene of data.scenes) {
    for (const key of ['id', 'chapter', 'title', 'narration', 'input', 'action', 'output', 'humanCheckpoint']) {
      if (typeof scene[key] !== 'string' || !scene[key].trim()) throw new Error(`${scene.id}: missing ${key}`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(scene.id) || ids.has(scene.id)) throw new Error(`invalid/duplicate id: ${scene.id}`);
    ids.add(scene.id);
    if (audio && (typeof scene.audioPath !== 'string' || !scene.audioPath.trim())) throw new Error(`${scene.id}: audioPath required`);
  }
  return data;
}

export function validateCaptions(scene, duration) {
  if (scene.captions === undefined) return null;
  if (!Array.isArray(scene.captions) || !scene.captions.length) throw new Error(`${scene.id}: captions must be nonempty`);
  let previous = 0;
  for (const cue of scene.captions) {
    if (typeof cue.text !== 'string' || !cue.text.trim() || !Number.isFinite(cue.start) || !Number.isFinite(cue.end)
      || cue.start < previous || cue.end <= cue.start || cue.end > duration + 0.001) {
      throw new Error(`${scene.id}: invalid caption timing/text`);
    }
    previous = cue.end;
  }
  const compact = text => text.replace(/\s/gu, '');
  if (compact(scene.captions.map(c => c.text).join('')) !== compact(scene.narration)) {
    throw new Error(`${scene.id}: captions must preserve the full narration (including punctuation)`);
  }
  return scene.captions;
}
