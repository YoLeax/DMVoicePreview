import { DEFAULT_FILTERS, FILTER_KEYS, filterVoices, prepareVoices, readFilters, formatTime } from './catalog.mjs';

const $ = selector => document.querySelector(selector);
const icons = {
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>',
  heart: '<path d="M20.8 4.9a5.3 5.3 0 0 0-7.5 0L12 6.2l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.6a5.3 5.3 0 0 0 0-7.5Z"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  previous: '<path d="m18 5-10 7 10 7ZM5 5v14"/>',
  next: '<path d="m6 5 10 7-10 7ZM19 5v14"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5Zm5 5 5 6m0-6-5 6"/>',
  filter: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="white"/><circle cx="15" cy="17" r="2.5" fill="white"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 4 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 1)"/>',
};
const icon = name => `<svg class="${name}-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`;
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
const escape = text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const audio = $('#audio');
audio.volume = 0.8;
const PAGE_SIZE = 24;
let voices = [], byKey = new Map(), matches = [], current = null, page = 1, playRequest = 0, toastTimer;
let filters = readFilters(location.search);
let favorites = new Set();
try { const saved = JSON.parse(localStorage.getItem('dm-voice-favorites') || '[]'); if (Array.isArray(saved)) favorites = new Set(saved.filter(key => typeof key === 'string')); } catch { /* Storage can be unavailable in private browsing. */ }

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
}

function updateURL() {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
  if (filters.favorites) params.set('favorites', '1');
  if (filters.sort !== 'recommended') params.set('sort', filters.sort);
  const deepLink = new URLSearchParams(location.search).get('voice');
  if (deepLink && byKey.has(deepLink)) params.set('voice', deepLink);
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
}

function populateFilters() {
  const languageMap = new Map(voices.flatMap(voice => voice.languages.map(language => [language.code, language.name])));
  const sortedLanguages = [...languageMap].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));
  for (const code of ['en', 'zh', 'zh-cn']) {
    const i = sortedLanguages.findIndex(item => item[0] === code);
    if (i >= 0) sortedLanguages.unshift(...sortedLanguages.splice(i, 1));
  }
  const selectOptions = (selector, values) => values.forEach(([value, label]) => $(selector).add(new Option(label, value)));
  selectOptions('#language-filter', sortedLanguages);
  const accents = [...new Set(voices.flatMap(voice => voice.accents))].filter(accent => /口音|式英语|澳洲英语/.test(accent)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const accentGroup = document.createElement('optgroup');
  accentGroup.label = '地域口音 / 英语细分';
  for (const accent of accents) accentGroup.append(new Option(accent, `accent:${accent}`));
  $('#language-filter').append(accentGroup);
  selectOptions('#age-filter', ['儿童', '少年/少女', '青年', '中年', '老年'].map(value => [value, value]));
  selectOptions('#tag-filter', [...new Set(voices.flatMap(voice => voice.tags))].map(value => [value, value]));
  const scenes = [...new Set(voices.flatMap(voice => voice.scenes))];
  $('#scene-options').innerHTML = [['', '全部场景'], ...scenes.map(scene => [scene, scene])].map(([value, label]) =>
    `<button class="scene-option" data-scene="${escape(value)}" aria-pressed="${filters.scene === value}">${escape(label)}<span>${value ? voices.filter(voice => voice.scenes.includes(value)).length : voices.length}</span></button>`).join('');
}

function syncControls() {
  $('#search').value = filters.q;
  for (const key of ['language', 'age', 'tag']) {
    const select = $(`#${key}-filter`);
    if (![...select.options].some(option => option.value === filters[key])) filters[key] = '';
    select.value = filters[key];
  }
  if (!['', '2.0', '1.0'].includes(filters.model)) filters.model = '';
  if (!['', '男', '女'].includes(filters.gender)) filters.gender = '';
  if (!voices.some(voice => voice.scenes.includes(filters.scene))) filters.scene = '';
  $('#sort').value = filters.sort;
  document.querySelectorAll('[data-model]').forEach(button => button.setAttribute('aria-pressed', button.dataset.model === filters.model));
  document.querySelectorAll('[data-gender]').forEach(button => button.setAttribute('aria-pressed', button.dataset.gender === filters.gender));
  document.querySelectorAll('[data-scene]').forEach(button => button.setAttribute('aria-pressed', button.dataset.scene === filters.scene));
  $('#favorites-button').setAttribute('aria-pressed', filters.favorites);
  $('#favorites-count').textContent = favorites.size;
}

function changeFilter(key, value) {
  filters[key] = value;
  page = 1;
  syncControls();
  render();
  updateURL();
}

function resetFilters() {
  filters = { ...DEFAULT_FILTERS };
  page = 1;
  syncControls();
  render();
  updateURL();
}

function card(voice) {
  const saved = favorites.has(voice.key), active = current?.key === voice.key, playing = active && !audio.paused;
  const tags = [...voice.tags.filter(tag => tag !== '上新').slice(0, 1).map(tag => [tag, 'accent']), ...voice.scenes.slice(0, 1).map(scene => [scene, '']), ...voice.languages.slice(0, 1).map(language => [language.name, 'language'])].slice(0, 3);
  return `<article class="voice-card${active ? ' is-current' : ''}${playing ? ' is-playing' : ''}" data-key="${voice.key}">
    <div class="card-top"><button class="avatar-button" data-action="play" aria-label="${playing ? '暂停' : '试听'} ${escape(voice.name)}">${voice.avatar ? `<img src="./${escape(voice.avatar)}" alt="" loading="lazy" decoding="async" width="49" height="49">` : escape(voice.name[0])}<span class="avatar-overlay">${icon(playing ? 'pause' : 'play')}</span></button><div class="card-info"><div class="card-name"><button class="name-button" data-action="detail" title="查看 ${escape(voice.name)} 的详情">${escape(voice.name)}</button><button class="icon-button copy-name-button" data-action="copy-name" title="复制名称：${escape(voice.name)}" aria-label="复制音色名称：${escape(voice.name)}">${icon('copy')}</button></div><div class="card-subtitle"><span>${escape(voice.gender)}声</span><span>${escape(voice.age)}</span><b class="model-badge">${escape(voice.model)}</b></div></div><button class="icon-button card-favorite" data-action="favorite" aria-label="${saved ? '取消收藏' : '收藏'} ${escape(voice.name)}" aria-pressed="${saved}">${icon('heart')}</button></div>
    <p class="card-description" title="${escape(voice.description)}">${escape(voice.description || voice.scenes.join(' · ') || '听一听这个声音的独特表达')}</p>
    <div class="card-tags">${tags.map(([tag, kind]) => `<span class="card-tag ${kind}">${escape(tag)}</span>`).join('')}</div>
    <div class="card-actions"><button class="play-button" data-action="play" aria-label="${playing ? '暂停' : '试听'} ${escape(voice.name)}"><span>${icon(playing ? 'pause' : 'play')}</span><b style="font-weight:500">${playing ? '正在播放' : '点击试听'}</b></button><span class="card-duration">${formatTime(voice.duration)}</span></div>
    <button class="card-id" data-action="copy" title="复制音色 ID：${escape(voice.id)}" aria-label="复制 ${escape(voice.name)} 的音色 ID"><span>${escape(voice.id)}</span>${icon('copy')}</button>
  </article>`;
}

function render() {
  matches = filterVoices(voices, filters, favorites);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  page = Math.max(1, Math.min(page, pages));
  $('#result-count').innerHTML = `找到 <strong>${matches.length}</strong> 个试听版本`;
  $('#random-button').disabled = !matches.length;
  const labels = { q: '搜索', model: '豆包', gender: '性别', language: '语言', age: '年龄', scene: '场景', tag: '标签' };
  const selected = FILTER_KEYS.filter(key => filters[key]);
  $('#active-filters').hidden = !selected.length && !filters.favorites;
  $('#active-filters').innerHTML = selected.map(key => {
    const value = key === 'language' ? $('#language-filter').selectedOptions[0]?.textContent || filters[key] : filters[key];
    return `<button class="filter-chip" data-remove="${key}" aria-label="移除${escape(labels[key])}筛选：${escape(value)}">${escape(labels[key])}：${escape(value)}<span aria-hidden="true">×</span></button>`;
  }).join('') + (filters.favorites ? '<button class="filter-chip" data-remove="favorites">我的收藏<span aria-hidden="true">×</span></button>' : '');
  const extraCount = ['gender', 'language', 'age', 'scene', 'tag'].filter(key => filters[key]).length;
  $('#filter-count').textContent = extraCount || '';
  $('#voice-grid').innerHTML = matches.length ? matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(card).join('') : `<div class="empty-state"><span aria-hidden="true">${filters.favorites ? '♡' : '⌕'}</span><h2>${filters.favorites && !favorites.size ? '把喜欢的声音留在这里' : '还没有找到合适的声音'}</h2><p>${filters.favorites && !favorites.size ? '点击音色卡片右上角的爱心，就能随时回来听。' : '试试更短的关键词，或放宽一些筛选条件。'}</p><button class="primary-button" data-reset>浏览全部音色</button></div>`;
  const pagination = $('#pagination');
  pagination.hidden = pages <= 1;
  const nearby = [...new Set([1, page - 1, page, page + 1, pages])].filter(number => number >= 1 && number <= pages).sort((a, b) => a - b);
  pagination.innerHTML = `<button data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="上一页">‹</button>` + nearby.map((number, index) => `${index && number - nearby[index - 1] > 1 ? '<span aria-hidden="true">…</span>' : ''}<button data-page="${number}" ${number === page ? 'aria-current="page"' : ''} aria-label="第 ${number} 页">${number}</button>`).join('') + `<button data-page="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="下一页">›</button><span>共 ${pages} 页</span>`;
}

function syncPlayback() {
  const playing = current && !audio.paused;
  $('#player-play').innerHTML = icon(playing ? 'pause' : 'play');
  $('#player-play').setAttribute('aria-label', playing ? '暂停' : '播放');
  for (const card of document.querySelectorAll('.voice-card')) {
    const isCurrent = card.dataset.key === current?.key, isPlaying = isCurrent && playing;
    card.classList.toggle('is-current', isCurrent);
    card.classList.toggle('is-playing', isPlaying);
    const voice = byKey.get(card.dataset.key);
    card.querySelectorAll('[data-action="play"]').forEach(button => button.setAttribute('aria-label', `${isPlaying ? '暂停' : '试听'} ${voice.name}`));
    card.querySelector('.avatar-overlay').innerHTML = icon(isPlaying ? 'pause' : 'play');
    card.querySelector('.play-button>span').innerHTML = icon(isPlaying ? 'pause' : 'play');
    card.querySelector('.play-button>b').textContent = isPlaying ? '正在播放' : '点击试听';
  }
  const detailPlay = $('#detail-content [data-detail-action="play"]');
  if (detailPlay) detailPlay.innerHTML = `${icon(playing && detailPlay.dataset.key === current.key ? 'pause' : 'play')} ${playing && detailPlay.dataset.key === current.key ? '暂停试听' : '试听这个音色'}`;
}

function syncPlayerFavorite() {
  const saved = current && favorites.has(current.key);
  $('#player-favorite').setAttribute('aria-pressed', Boolean(saved));
  $('#player-favorite').setAttribute('aria-label', saved ? '取消收藏当前音色' : '收藏当前音色');
}

async function playVoice(voice) {
  if (!voice?.audio) { toast('这个音色暂时无法试听'); return; }
  const request = ++playRequest;
  if (current?.key === voice.key && !audio.paused) { audio.pause(); return; }
  if (current?.key !== voice.key) {
    audio.pause();
    current = voice;
    audio.src = `./${voice.audio}`;
    audio.playbackRate = Number($('#speed').value);
    $('#player-avatar').innerHTML = voice.avatar ? `<img src="./${escape(voice.avatar)}" alt="" width="47" height="47">` : `<span>${escape(voice.name[0])}</span>`;
    $('#player-name').textContent = voice.name;
    $('#player-meta').textContent = `${voice.gender}声 · ${voice.age} · 豆包 ${voice.model}`;
    $('#duration').textContent = formatTime(voice.duration);
    $('#elapsed').textContent = '0:00';
    $('#seek').value = 0;
    $('#seek').style.setProperty('--progress', '0%');
    for (const selector of ['#player-play', '#previous-track', '#next-track', '#player-favorite', '#seek']) $(selector).disabled = false;
    syncPlayerFavorite();
  }
  if (audio.ended) audio.currentTime = 0;
  if (audio.error) audio.load();
  syncPlayback();
  try { await audio.play(); } catch (error) { if (request === playRequest && error.name !== 'AbortError') toast(error.name === 'NotAllowedError' ? '请再点击一次播放按钮开始试听' : '音频暂时无法播放，请稍后重试'); }
  if (request === playRequest) syncPlayback();
}

function stepTrack(direction) {
  if (!matches.length) { toast('当前筛选条件下没有可试听的音色'); return; }
  const index = matches.findIndex(voice => voice.key === current?.key);
  playVoice(matches[index < 0 ? 0 : (index + direction + matches.length) % matches.length]);
}

function toggleFavorite(voice) {
  if (!voice) return;
  const previouslySaved = favorites.has(voice.key);
  if (previouslySaved) favorites.delete(voice.key); else favorites.add(voice.key);
  try { localStorage.setItem('dm-voice-favorites', JSON.stringify([...favorites])); }
  catch { toast('浏览器无法保存收藏，本次打开期间仍可使用'); }
  $('#favorites-count').textContent = favorites.size;
  if (filters.favorites) render();
  else document.querySelectorAll(`.voice-card[data-key="${voice.key}"] [data-action="favorite"]`).forEach(button => {
    button.setAttribute('aria-pressed', !previouslySaved);
    button.setAttribute('aria-label', `${previouslySaved ? '收藏' : '取消收藏'} ${voice.name}`);
  });
  syncPlayerFavorite();
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${label}已复制`);
  } catch {
    const field = document.createElement('textarea');
    field.value = value;
    field.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
    const container = document.querySelector('dialog[open]') || document.body;
    container.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (copied) toast(`${label}已复制`);
    else { window.prompt(`请复制${label}`, value); }
  }
}

function showDetail(voice) {
  const languages = voice.languages.map(language => language.name).join(' / ');
  const samples = voice.languages.filter(language => language.text && !/^(默认|default)/i.test(language.text));
  $('#detail-content').innerHTML = `<div class="dialog-eyebrow">VOICE PROFILE / 豆包 ${escape(voice.model)}</div><div class="detail-header">${voice.avatar ? `<img src="./${escape(voice.avatar)}" alt="">` : `<span class="detail-fallback">${escape(voice.name[0])}</span>`}<div><h2 id="detail-title">${escape(voice.name)}</h2><p>${escape(voice.gender)}声 · ${escape(voice.age)} · ${formatTime(voice.duration)}</p></div></div><p class="detail-description">${escape(voice.description || '官方音色库试听示例')}</p><div class="detail-tags">${[...new Set([...voice.tags, ...voice.scenes, ...voice.accents])].map(tag => `<span>${escape(tag)}</span>`).join('')}</div><div class="detail-section"><h3>语言 / 口音</h3><p>${escape(languages)}</p></div>${voice.emotions.length ? `<div class="detail-section"><h3>官方标注的情感能力</h3><p>${escape(voice.emotions.map(emotion => emotion.label).join(' · '))}</p></div>` : ''}<div class="detail-section"><h3>音色 ID</h3><code>${escape(voice.id)}</code></div>${samples.length ? `<div class="detail-section"><h3>官方示例文案</h3>${samples.map(language => `<blockquote class="sample-text"><span>${escape(language.name)}</span>${escape(language.text)}</blockquote>`).join('')}</div>` : ''}<div class="detail-actions"><button class="primary-button" data-detail-action="play" data-key="${voice.key}">${icon('play')} 试听这个音色</button><button class="secondary-button" data-detail-action="copy" data-key="${voice.key}">${icon('copy')} 复制 ID</button><button class="secondary-button" data-detail-action="share" data-key="${voice.key}">${icon('link')} 分享音色</button></div>`;
  $('#detail-dialog').showModal();
  syncPlayback();
}

function setFilterPanel(open) {
  $('#filters').classList.toggle('is-open', open);
  $('#filter-scrim').hidden = !open;
  document.body.classList.toggle('filters-open', open);
  $('#open-filters').setAttribute('aria-expanded', open);
  if (open) {
    $('#filters').setAttribute('role', 'dialog');
    $('#filters').setAttribute('aria-modal', 'true');
    $('#close-filters').focus();
  } else {
    $('#filters').removeAttribute('role');
    $('#filters').removeAttribute('aria-modal');
    $('#open-filters').focus();
  }
}

$('#search').addEventListener('input', event => changeFilter('q', event.target.value));
$('#model-tabs').addEventListener('click', event => { const button = event.target.closest('[data-model]'); if (button) changeFilter('model', button.dataset.model); });
$('#gender-options').addEventListener('click', event => { const button = event.target.closest('[data-gender]'); if (button) changeFilter('gender', button.dataset.gender); });
$('#scene-options').addEventListener('click', event => { const button = event.target.closest('[data-scene]'); if (button) changeFilter('scene', button.dataset.scene); });
for (const key of ['language', 'age', 'tag']) $(`#${key}-filter`).addEventListener('change', event => changeFilter(key, event.target.value));
$('#sort').addEventListener('change', event => changeFilter('sort', event.target.value));
$('#favorites-button').addEventListener('click', () => changeFilter('favorites', !filters.favorites));
$('#reset-filters').addEventListener('click', resetFilters);
$('#active-filters').addEventListener('click', event => { const button = event.target.closest('[data-remove]'); if (button) changeFilter(button.dataset.remove, button.dataset.remove === 'favorites' ? false : ''); });
$('#voice-grid').addEventListener('click', event => {
  if (event.target.closest('[data-reset]')) { resetFilters(); return; }
  const button = event.target.closest('[data-action]');
  const voice = byKey.get(button?.closest('[data-key]')?.dataset.key);
  if (!voice) return;
  if (button.dataset.action === 'play') playVoice(voice);
  if (button.dataset.action === 'favorite') toggleFavorite(voice);
  if (button.dataset.action === 'copy') copyText(voice.id, '音色 ID');
  if (button.dataset.action === 'copy-name') copyText(voice.name, '音色名称');
  if (button.dataset.action === 'detail') showDetail(voice);
});
$('#pagination').addEventListener('click', event => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  page = Number(button.dataset.page);
  render();
  $('#voice-grid').scrollIntoView({ behavior: 'instant', block: 'start' });
  $('#voice-grid').focus({ preventScroll: true });
});
$('#random-button').addEventListener('click', () => { if (matches.length) playVoice(matches[Math.floor(Math.random() * matches.length)]); });
$('#player-play').addEventListener('click', () => { if (current) playVoice(current); });
$('#previous-track').addEventListener('click', () => stepTrack(-1));
$('#next-track').addEventListener('click', () => stepTrack(1));
$('#player-favorite').addEventListener('click', () => toggleFavorite(current));
$('#continuous').addEventListener('click', event => { const button = event.currentTarget; const enabled = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', enabled); toast(enabled ? '已开启连续试听，将依次播放当前筛选结果' : '已关闭连续试听'); });
$('#speed').addEventListener('change', event => { audio.playbackRate = Number(event.target.value); });
$('#volume').addEventListener('input', event => { audio.volume = Number(event.target.value); audio.muted = audio.volume === 0; });
$('#volume-button').addEventListener('click', () => { audio.muted = !audio.muted; });
audio.addEventListener('volumechange', () => {
  $('#volume-button').innerHTML = icon(audio.muted || audio.volume === 0 ? 'mute' : 'volume');
  $('#volume-button').setAttribute('aria-label', audio.muted ? '取消静音' : '静音');
  $('#volume').value = audio.muted ? 0 : audio.volume;
  $('#volume').style.setProperty('--progress', `${Number($('#volume').value) * 100}%`);
});
$('#seek').addEventListener('input', event => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value) / 100 * audio.duration; });
audio.addEventListener('timeupdate', () => {
  const progress = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration * 100 : 0;
  $('#seek').value = progress;
  $('#seek').style.setProperty('--progress', `${progress}%`);
  $('#elapsed').textContent = formatTime(audio.currentTime);
});
audio.addEventListener('loadedmetadata', () => { $('#duration').textContent = formatTime(audio.duration); });
audio.addEventListener('play', syncPlayback);
audio.addEventListener('pause', syncPlayback);
audio.addEventListener('ended', () => { syncPlayback(); if ($('#continuous').getAttribute('aria-pressed') === 'true' && matches.length) stepTrack(1); });
audio.addEventListener('error', () => { if (audio.getAttribute('src')) { toast('音频加载失败，点击播放可重新尝试'); syncPlayback(); } });
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
$('#detail-content').addEventListener('click', event => {
  const button = event.target.closest('[data-detail-action]');
  const voice = byKey.get(button?.dataset.key);
  if (!voice) return;
  if (button.dataset.detailAction === 'play') playVoice(voice);
  if (button.dataset.detailAction === 'copy') copyText(voice.id, '音色 ID');
  if (button.dataset.detailAction === 'share') { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('voice', voice.key); copyText(url.href, '试听链接'); }
});
$('#open-filters').addEventListener('click', () => setFilterPanel(true));
for (const selector of ['#close-filters', '#filter-scrim', '#apply-filters']) $(selector).addEventListener('click', () => setFilterPanel(false));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('filters-open')) setFilterPanel(false);
  if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]') && !document.body.classList.contains('filters-open')) { event.preventDefault(); $('#search').focus(); }
  if (event.key === 'Tab' && document.body.classList.contains('filters-open')) {
    const focusable = [...$('#filters').querySelectorAll('button, select')].filter(element => element.offsetParent !== null);
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  }
});
window.addEventListener('popstate', () => { filters = readFilters(location.search); page = 1; syncControls(); render(); });
window.addEventListener('storage', event => {
  if (event.key === 'dm-voice-favorites') {
    try { const saved = JSON.parse(event.newValue || '[]'); if (Array.isArray(saved)) favorites = new Set(saved.filter(key => byKey.has(key))); } catch { return; }
    syncControls(); render(); syncPlayerFavorite();
  }
});
window.matchMedia('(min-width:721px)').addEventListener('change', event => { if (event.matches && document.body.classList.contains('filters-open')) setFilterPanel(false); });

try {
  const response = await fetch('./data/voices.json');
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json();
  voices = prepareVoices(catalog.voices);
  byKey = new Map(voices.map(voice => [voice.key, voice]));
  favorites = new Set([...favorites].filter(key => byKey.has(key)));
  $('#total-count').textContent = voices.length;
  $('#all-count').textContent = voices.length;
  $('#v2-count').textContent = voices.filter(voice => voice.model === '2.0').length;
  $('#v1-count').textContent = voices.filter(voice => voice.model === '1.0').length;
  $('#update-date').textContent = `收录于 ${catalog.updatedAt.replaceAll('-', '.')}`;
  populateFilters(); syncControls(); render();
  const linkedVoice = byKey.get(new URLSearchParams(location.search).get('voice'));
  if (linkedVoice) showDetail(linkedVoice);
} catch (error) {
  console.error('Unable to load voice catalog', error);
  $('#result-count').textContent = '音色库暂时未能加载';
  $('#voice-grid').innerHTML = '<div class="empty-state"><h2>音色库还没准备好</h2><p>请检查网络连接，然后刷新页面重试。</p><button class="primary-button" id="reload-button">重新加载</button></div>';
  $('#reload-button').addEventListener('click', () => location.reload());
  $('#random-button').disabled = true;
}
