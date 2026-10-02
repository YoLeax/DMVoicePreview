import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FILTERS, filterVoices, prepareVoices, readFilters, formatTime } from '../web/catalog.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/data/voices.json', import.meta.url), 'utf8'));
const voices = prepareVoices(catalog.voices);
const filter = values => ({ ...DEFAULT_FILTERS, ...values });

test('every source record survives with a unique preview key and a valid local audio file', async () => {
  const source = JSON.parse(await readFile(new URL('../data/source-catalog.json', import.meta.url), 'utf8'));
  assert.equal(voices.length, source.total);
  assert.equal(new Set(voices.map(voice => voice.key)).size, voices.length);
  assert.equal(new Set(voices.map(voice => voice.id)).size, catalog.summary.uniqueVoiceIds);
  assert.equal(catalog.summary.playable, voices.length);
  for (const voice of voices) {
    assert.match(voice.audio, /^assets\/audio\/[a-f0-9]{16}\.mp3$/);
    assert.ok(voice.duration > 0, voice.name);
    assert.ok(voice.audioBytes > 1000, voice.name);
  }
  const assets = new Set(voices.flatMap(voice => [voice.audio, voice.avatar]).filter(Boolean));
  const sizes = await Promise.all([...assets].map(asset => stat(fileURLToPath(new URL(`../public/${asset}`, import.meta.url)))));
  assert.ok(sizes.every(file => file.size > 0));
});

test('search accepts full-width input, case-insensitive IDs, and multiple terms', () => {
  const vivi = filterVoices(voices, filter({ q: 'ＶＩＶＩ ２．０' }));
  assert.ok(vivi.some(voice => voice.name === 'Vivi 2.0'));
  const sample = voices[0];
  assert.ok(filterVoices(voices, filter({ q: sample.id.toUpperCase() })).some(voice => voice.key === sample.key));
  assert.equal(filterVoices(voices, filter({ q: 'no_such_voice_xyz_132' })).length, 0);
});

test('combined language, model, gender, age and scenario filters preserve all constraints', () => {
  const sample = voices.find(voice => voice.model === '2.0' && voice.languages.length && voice.scenes.length);
  const result = filterVoices(voices, filter({ model: sample.model, gender: sample.gender, age: sample.age, language: sample.languages[0].code, scene: sample.scenes[0] }));
  assert.ok(result.some(voice => voice.key === sample.key));
  assert.ok(result.every(voice => voice.model === sample.model && voice.gender === sample.gender && voice.age === sample.age && voice.languages.some(language => language.code === sample.languages[0].code) && voice.scenes.includes(sample.scenes[0])));
});

test('different previews sharing a voice ID can be favorited independently', () => {
  const pair = voices.filter(voice => voice.id === voices.find(voice => voices.some(other => other.id === voice.id && other.key !== voice.key)).id);
  assert.ok(pair.length > 1);
  const result = filterVoices(voices, filter({ favorites: true }), new Set([pair[1].key]));
  assert.deepEqual(result.map(voice => voice.key), [pair[1].key]);
  assert.equal(filterVoices(voices, filter({ favorites: true }), new Set()).length, 0);
});

test('regional accents are selectable independently of broad language support', () => {
  const result = filterVoices(voices, filter({ language: 'accent:四川口音' }));
  assert.ok(result.length > 0);
  assert.ok(result.every(voice => voice.accents.includes('四川口音')));
});

test('duration ordering and URL filters are stable', () => {
  const result = filterVoices(voices, filter({ sort: 'duration' }));
  assert.ok(result.every((voice, index) => !index || voice.duration >= result[index - 1].duration));
  assert.equal(readFilters('?sort=invalid').sort, 'recommended');
  assert.deepEqual(readFilters('?q=Vivi&model=2.0&language=ja&favorites=1'), filter({ q: 'Vivi', model: '2.0', language: 'ja', favorites: true }));
  assert.equal(formatTime(125.8), '2:05');
  assert.equal(formatTime(NaN), '0:00');
});
