import { RULES, COLORS, COUNTS, createGame, canAct, act, counts } from './game.mjs';

const $ = selector => document.querySelector(selector);
const icon = (name, className = '') => `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const colorNames = { blue: 'Синий', red: 'Красный', gold: 'Золотой' };
const itemNames = { key: 'ключ', bomb: 'бомба', empty: 'Пустой сейф' };
const coordinate = id => `${'АБВГ'[Math.floor(id / 4)]}${id % 4 + 1}`;
const storageKey = 'c1dance-league-training-v1';
let stats = { games: 0, wins: 0 }, round = 1, mode = 'open', game, startedAt, elapsedBefore = 0, finishedElapsed = null;
let lastMessage = 'Начни с подсказки или открой первый сейф.', messageType = '', resultDismissed = false;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved?.version === 1 && saved.stats && Number.isInteger(saved.stats.games) && saved.stats.games >= 0 && Number.isInteger(saved.stats.wins) && saved.stats.wins >= 0 && saved.stats.wins <= saved.stats.games) {
    stats = saved.stats;
    round = Math.max(1, Number(saved.round) || 1);
    const source = saved.game;
    if (source?.board?.length === 16 && source.board.every(item => ['key', 'bomb', 'empty'].includes(item.kind) && (item.kind === 'empty' ? item.color === null : COLORS.includes(item.color))) && source.hinted?.length === 16 && Array.isArray(source.log)) {
      const restored = createGame(source.board);
      let valid = true;
      for (const entry of [...source.log].reverse()) {
        if (!act(restored, entry.id, entry.mode)) { valid = false; break; }
      }
      if (valid) {
        game = restored;
        elapsedBefore = Math.max(0, Math.min(86400000, Number(saved.elapsed) || 0));
        if (game.phase !== 'playing') finishedElapsed = elapsedBefore;
        resultDismissed = Boolean(saved.resultDismissed);
        lastMessage = game.phase === 'playing' ? 'Раунд восстановлен. Продолжай с последнего хода.' : game.phase === 'won' ? 'Все пять ключей найдены. Кубок твой!' : 'Прочность закончилась. Попробуй новую раскладку.';
      }
    }
  }
} catch { /* Browsers can disable local storage. The game still works. */ }
if (!game) game = createGame();
startedAt = Date.now();

function elapsed() { return finishedElapsed ?? elapsedBefore + Date.now() - startedAt; }
function timeText(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, game, stats, round, elapsed: elapsed(), resultDismissed })); } catch {}
}
function label(item) {
  if (item.kind === 'empty') return 'Пустой сейф';
  const color = item.kind === 'bomb' ? { blue: 'Синяя', red: 'Красная', gold: 'Золотая' }[item.color] : colorNames[item.color];
  return `${color} ${itemNames[item.kind]}`;
}
function message(text, type = '') {
  lastMessage = text;
  messageType = type;
  $('#message-text').textContent = text;
  $('#board-message').className = `board-message ${type}`;
}
function setMode(next) {
  mode = next;
  $('#mode-open').classList.toggle('selected', mode === 'open');
  $('#mode-hint').classList.toggle('selected', mode === 'hint');
  $('#mode-open').setAttribute('aria-pressed', String(mode === 'open'));
  $('#mode-hint').setAttribute('aria-pressed', String(mode === 'hint'));
  $('#mode-note').textContent = mode === 'open' ? 'Выбери сейф' : 'Посмотреть содержимое';
  renderBoard();
}
function renderBoard() {
  const ended = game.phase !== 'playing';
  const focusId = document.activeElement?.dataset?.id;
  const board = $('#board');
  board.replaceChildren();
  for (let id = 0; id < 16; id++) {
    const item = game.board[id], opened = game.opened[id], hinted = game.hinted[id];
    const revealed = ended || opened || hinted;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `safe${revealed ? ` revealed ${item.color || 'empty'}` : ''}${hinted && !opened ? ' hinted' : ''}${ended && !hinted && !opened ? ' final-hidden' : ''}${opened && item.kind === 'bomb' ? ' bomb-hit' : ''}`;
    button.dataset.id = String(id);
    button.disabled = !canAct(game, id, mode);
    const status = revealed ? `${label(item)}, ${opened ? 'открыт' : hinted ? 'подсмотрен' : 'раскрыт после игры'}` : 'закрыт';
    button.setAttribute('aria-label', `Сейф ${coordinate(id)}, ${status}${!button.disabled ? mode === 'hint' ? '. Подсказка за 6 прочности' : '. Открыть за 5 прочности' : ''}`);
    button.innerHTML = `<span class="safe-index">${String(id + 1).padStart(2, '0')}</span>${icon(revealed ? item.kind === 'empty' ? 'x' : item.kind : 'vault', 'safe-icon')}<span class="safe-lock-label">${revealed ? item.kind === 'empty' ? 'ПУСТО' : item.kind === 'key' ? 'КЛЮЧ' : 'БОМБА' : 'ЗАКРЫТ'}</span>${hinted && !opened ? `<span class="hint-marker">${icon('eye')}</span>` : opened ? icon('check', 'opened-check') : ''}`;
    button.addEventListener('click', () => handleAction(id));
    button.addEventListener('keydown', event => {
      const shift = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key];
      if (!shift) return;
      event.preventDefault();
      let next = id + shift;
      while (next >= 0 && next < 16) {
        const target = board.querySelector(`[data-id="${next}"]`);
        if (target && !target.disabled) { target.focus(); break; }
        next += shift;
      }
    });
    board.append(button);
  }
  if (focusId !== undefined) board.querySelector(`[data-id="${focusId}"]:not(:disabled)`)?.focus({ preventScroll: true });
}
function renderCollection() {
  const found = counts(game);
  $('#key-collection').innerHTML = COLORS.map(color => Array.from({ length: COUNTS[color] }, (_, index) => `<span class="collection-key ${color}${index < found[color] ? ' collected' : ''}" role="img" aria-label="${colorNames[color]} ключ ${index < found[color] ? 'найден' : 'не найден'}">${icon('key')}</span>`).join('')).join('');
}
function renderJournal() {
  $('#turn-count').textContent = String(game.turns);
  if (!game.log.length) {
    $('#journal').innerHTML = `<div class="journal-empty">${icon('vault')}<p>Здесь появится<br>история твоих решений</p></div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of game.log) {
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `<span class="log-symbol ${entry.color || ''}">${icon(entry.mode === 'hint' ? 'eye' : entry.kind === 'empty' ? 'x' : entry.kind)}</span><div class="log-copy"><strong>${entry.mode === 'hint' ? 'Подсказка' : 'Открытие'} · ${coordinate(entry.id)}</strong><span>${label(entry.kind === 'empty' ? { kind: 'empty' } : entry)}</span></div><small>−${entry.cost}</small>`;
    fragment.append(row);
  }
  $('#journal').replaceChildren(fragment);
}
function renderResult() {
  const visible = game.phase !== 'playing' && !resultDismissed;
  $('#result-panel').hidden = !visible;
  $('#result-panel').classList.toggle('lost', game.phase === 'lost');
  const won = game.phase === 'won';
  $('#result-eyebrow').textContent = won ? 'ОТЛИЧНАЯ ИГРА' : 'КАЖДЫЙ ХОД — ОПЫТ';
  $('#result-title').textContent = won ? 'Кубок твой!' : 'Ещё одна попытка?';
  $('#result-description').textContent = won ? `Все пять ключей найдены за ${game.turns} ходов. Осталось ${game.strength} прочности.` : `Найдено ${game.keys} из 5 ключей. Попробуй использовать подсказки и правило соседства.`;
  if (visible) queueMicrotask(() => $('.result-dialog').focus({ preventScroll: true }));
}
function render() {
  $('#round-label').textContent = `Раунд ${String(round).padStart(2, '0')}`;
  $('#strength').textContent = String(game.strength);
  $('#key-count').textContent = String(game.keys);
  $('#strength-fill').style.width = `${game.strength}%`;
  $('.strength-track').setAttribute('aria-valuenow', String(game.strength));
  $('.strength-track').classList.toggle('low', game.strength <= 25);
  $('#timer').textContent = timeText(elapsed());
  renderBoard(); renderCollection(); renderJournal(); renderResult();
  message(lastMessage, messageType);
}
function handleAction(id) {
  const entry = act(game, id, mode);
  if (!entry) return;
  const action = mode === 'hint' ? 'Подсказка' : 'Открытие';
  message(`${action} · ${coordinate(id)}. ${label(entry)}. −${entry.cost} прочности.`, entry.kind === 'bomb' ? mode === 'hint' ? 'warning' : 'danger' : entry.kind === 'key' ? 'success' : '');
  if (game.phase !== 'playing') {
    finishedElapsed = elapsed();
    stats.games++;
    if (game.phase === 'won') stats.wins++;
    message(game.phase === 'won' ? 'Все пять ключей найдены. Кубок твой!' : 'Прочности на следующее открытие не хватает. Попробуй ещё.', game.phase === 'won' ? 'success' : 'danger');
  } else if (game.strength < RULES.hintCost && mode === 'hint') setMode('open');
  render(); persist();
}
function newGame() {
  round++; game = createGame(); startedAt = Date.now(); elapsedBefore = 0; finishedElapsed = null; resultDismissed = false;
  message('Новая раскладка готова. Всё начинается с твоего решения.');
  setMode('open'); render(); persist();
}

$('#mode-open').addEventListener('click', () => setMode('open'));
$('#mode-hint').addEventListener('click', () => {
  if (game.phase === 'playing' && game.strength < 6) { message('Для подсказки нужно 6 прочности. Можно открыть сейф за 5.', 'warning'); return; }
  setMode('hint');
});
$('#restart').addEventListener('click', () => {
  if (game.phase === 'playing' && game.turns) $('#restart-dialog').showModal();
  else newGame();
});
$('#cancel-restart').addEventListener('click', () => $('#restart-dialog').close());
$('#confirm-restart').addEventListener('click', () => { $('#restart-dialog').close(); newGame(); });
$('.next-game').addEventListener('click', newGame);
$('.result-dialog').addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); $('#inspect-board').click(); }
  if (event.key === 'Tab') {
    event.preventDefault();
    const first = $('.next-game'), last = $('#inspect-board');
    if (event.shiftKey) (document.activeElement === first ? last : first).focus();
    else (document.activeElement === last ? first : document.activeElement === first ? last : first).focus();
  }
});
$('#inspect-board').addEventListener('click', () => { resultDismissed = true; $('#result-panel').hidden = true; $('#restart').focus(); persist(); });
document.querySelectorAll('.rules-trigger').forEach(button => button.addEventListener('click', () => $('#rules-dialog').showModal()));
document.querySelectorAll('#rules-dialog .close-dialog').forEach(button => button.addEventListener('click', () => $('#rules-dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]') || !$('#result-panel').hidden) return;
  if (event.key === '1') { event.preventDefault(); setMode('open'); }
  if (event.key === '2') { event.preventDefault(); $('#mode-hint').click(); }
});
setInterval(() => { $('#timer').textContent = timeText(elapsed()); }, 1000);
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
render();
