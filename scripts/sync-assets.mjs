import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(path.join(root, 'data/source-catalog.json'), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
const exists = async file => (await stat(file).catch(() => null))?.size > 0;
const cache = path.join(root, '.cache');
for (const dir of [cache, 'public/assets/audio', 'public/assets/avatars', 'public/data']) {
  await mkdir(path.resolve(root, dir), { recursive: true });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { windowsHide: true });
    let output = '', errors = '';
    process.stdout.on('data', chunk => { output += chunk; });
    process.stderr.on('data', chunk => { errors += chunk; });
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors.slice(-1600))));
  });
}

async function download(url, file) {
  if (await exists(file)) return;
  const address = new URL(url);
  if (address.protocol !== 'https:' || address.hostname !== 'lf3-static.bytednsdoc.com') {
    throw new Error(`Unexpected source host: ${address.hostname}`);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(address, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length) throw new Error('Empty media file');
      await writeFile(file + '.part', data);
      await rename(file + '.part', file);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

const jobs = [
  ...[...new Set(source.voices.map(v => v.TrialURL))].map(url => ({ url, kind: 'audio' })),
  ...[...new Set(source.voices.map(v => v.Avatar).filter(Boolean))].map(url => ({ url, kind: 'avatar' }))
];
const results = new Map();
const failures = [];
let position = 0, finished = 0;
async function worker() {
  while (position < jobs.length) {
    const job = jobs[position++];
    try {
      const id = hash(job.url);
      const extension = path.extname(new URL(job.url).pathname) || '.bin';
      const original = path.join(cache, id + extension);
      const relative = job.kind === 'audio' ? `assets/audio/${id}.mp3` : `assets/avatars/${id}.webp`;
      const output = path.join(root, 'public', relative);
      await download(job.url, original);
      if (!(await exists(output))) {
        await run('ffmpeg', job.kind === 'audio'
          ? ['-hide_banner', '-loglevel', 'error', '-i', original, '-map', '0:a:0', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-map_metadata', '-1', '-y', output]
          : ['-hide_banner', '-loglevel', 'error', '-i', original, '-vf', 'scale=160:160:force_original_aspect_ratio=decrease', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', '-y', output]);
      }
      let duration;
      if (job.kind === 'audio') {
        const probe = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output]));
        duration = Math.round(Number(probe.format.duration) * 100) / 100;
        if (!(duration > 0)) throw new Error('No valid audio duration');
      }
      results.set(job.url, { path: relative, bytes: (await stat(output)).size, originalBytes: (await stat(original)).size, ...(duration ? { duration } : {}) });
    } catch (error) {
      failures.push({ ...job, error: error.message });
      console.error(`${job.kind} failed: ${job.url} — ${error.message}`);
    }
    finished++;
    if (finished % 50 === 0 || finished === jobs.length) console.log(`Prepared ${finished}/${jobs.length} assets (${failures.length} failures)`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const languageNames = Object.fromEntries(source.languages.map(l => [l.Language, l.Text]));
const voices = source.voices.map((v, index) => {
  const audio = results.get(v.TrialURL);
  const avatar = results.get(v.Avatar);
  return {
    key: hash([v.VoiceType, v.Name.trim(), ...v.Languages.map(l => l.Language)].join('|')),
    id: v.VoiceType,
    name: v.Name.trim(),
    description: v.Description?.trim() || '',
    gender: v.Gender || '未标注',
    age: v.Age || '未标注',
    model: v.ResourceID === 'seed-tts-2.0' ? '2.0' : '1.0',
    scenes: [...new Set((v.Categories || []).map(c => c.Categories[0]).filter(Boolean))],
    accents: [...new Set((v.Categories || []).flatMap(c => c.Categories.slice(1)))],
    tags: [...new Set([...(v.NormalLabels || []), ...(v.SpecialLabels || [])])],
    languages: v.Languages.map(l => ({ code: l.Language, name: languageNames[l.Language] || l.Language, text: l.Text?.trim() || '' })),
    emotions: (v.Emotions || []).filter(e => e.Value && e.Label).map(e => ({ label: e.Label, value: e.Value })),
    heat: v.Heat || 0,
    order: index,
    audio: audio?.path || null,
    duration: audio?.duration || 0,
    audioBytes: audio?.bytes || 0,
    avatar: avatar?.path || null,
    sourceAudio: v.TrialURL,
    bidirectionalUnsupported: !!v.BidirectionalUnsupport
  };
});
const summary = {
  records: voices.length,
  uniqueVoiceIds: new Set(voices.map(v => v.id)).size,
  playable: voices.filter(v => v.audio).length,
  audioFiles: [...results].filter(([url, r]) => r.path.startsWith('assets/audio/')).length,
  avatarFiles: [...results].filter(([url, r]) => r.path.startsWith('assets/avatars/')).length,
  bytes: [...results.values()].reduce((n, r) => n + r.bytes, 0),
  originalBytes: [...results.values()].reduce((n, r) => n + r.originalBytes, 0)
};
await writeFile(path.join(root, 'public/data/voices.json'), JSON.stringify({ updatedAt: source.capturedAt, source: source.source, summary, voices }));
await writeFile(path.join(root, 'data/asset-manifest.json'), JSON.stringify({ capturedAt: source.capturedAt, summary, assets: Object.fromEntries(results), failures }, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (failures.some(f => f.kind === 'audio')) process.exitCode = 1;
