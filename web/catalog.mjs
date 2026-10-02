export const FILTER_KEYS = ['q', 'model', 'gender', 'language', 'age', 'scene', 'tag'];
export const DEFAULT_FILTERS = Object.freeze({ q: '', model: '', gender: '', language: '', age: '', scene: '', tag: '', favorites: false, sort: 'recommended' });
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();

export function prepareVoices(voices) {
  return voices.map(voice => ({ ...voice, searchText: normalize([
    voice.name, voice.id, voice.description, voice.gender, voice.age,
    ...voice.tags, ...voice.scenes, ...voice.accents,
    ...voice.languages.flatMap(language => [language.code, language.name]),
    ...voice.emotions.map(emotion => emotion.label),
  ].join(' ')) }));
}

export function filterVoices(voices, filters, favorites = new Set()) {
  const terms = normalize(filters.q).split(/\s+/).filter(Boolean);
  return voices.filter(voice =>
    (!filters.model || voice.model === filters.model) &&
    (!filters.gender || voice.gender === filters.gender) &&
    (!filters.language || (filters.language.startsWith('accent:')
      ? voice.accents.includes(filters.language.slice(7))
      : voice.languages.some(language => language.code === filters.language))) &&
    (!filters.age || voice.age === filters.age) &&
    (!filters.scene || voice.scenes.includes(filters.scene)) &&
    (!filters.tag || voice.tags.includes(filters.tag)) &&
    (!filters.favorites || favorites.has(voice.key)) &&
    terms.every(term => voice.searchText.includes(term))
  ).sort((a, b) => filters.sort === 'name'
    ? a.name.localeCompare(b.name, 'zh-CN') || a.order - b.order
    : filters.sort === 'duration' ? a.duration - b.duration || a.order - b.order : a.order - b.order);
}

export function readFilters(search) {
  const params = new URLSearchParams(search);
  const result = { ...DEFAULT_FILTERS };
  for (const key of FILTER_KEYS) result[key] = params.get(key) || '';
  result.favorites = params.get('favorites') === '1';
  if (['recommended', 'name', 'duration'].includes(params.get('sort'))) result.sort = params.get('sort');
  return result;
}

export function formatTime(seconds) {
  const value = Math.floor(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
