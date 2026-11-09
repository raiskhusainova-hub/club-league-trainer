export const RULES = Object.freeze({ size: 4, strength: 100, hintCost: 6, openCost: 5, bombCost: 20, keyCount: 5 });
export const COLORS = Object.freeze(['blue', 'red', 'gold']);
export const COUNTS = Object.freeze({ blue: 2, red: 2, gold: 1 });

export function neighbors(id) {
  const around = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const other = row * 4 + col;
      if (other !== id && Math.abs(row - Math.floor(id / 4)) <= 1 && Math.abs(col - id % 4) <= 1) around.push(other);
    }
  }
  return around;
}

const adjacent = Array.from({ length: 16 }, (_, id) => neighbors(id));
const masksOfFour = [];
const pairs = [];
for (let a = 0; a < 16; a++) {
  for (let b = a + 1; b < 16; b++) {
    if (adjacent[a].includes(b)) continue;
    pairs.push((1 << a) | (1 << b));
    for (let c = b + 1; c < 16; c++) {
      if (adjacent[a].includes(c) || adjacent[b].includes(c)) continue;
      for (let d = c + 1; d < 16; d++) {
        if (![a, b, c].some(id => adjacent[id].includes(d))) masksOfFour.push((1 << a) | (1 << b) | (1 << c) | (1 << d));
      }
    }
  }
}

const pick = (items, random) => items[Math.floor(random() * items.length)];
function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const next = Math.floor(random() * (i + 1));
    [result[i], result[next]] = [result[next], result[i]];
  }
  return result;
}

export function generateBoard(random = Math.random) {
  const blue = pick(masksOfFour, random);
  const red = pick(masksOfFour.filter(mask => !(mask & blue)), random);
  const gold = pick(pairs.filter(mask => !(mask & (blue | red))), random);
  const board = Array.from({ length: 16 }, () => ({ kind: 'empty', color: null }));
  for (const [color, mask] of [['blue', blue], ['red', red], ['gold', gold]]) {
    const ids = shuffled(Array.from({ length: 16 }, (_, id) => id).filter(id => mask & (1 << id)), random);
    ids.forEach((id, index) => { board[id] = { kind: index < COUNTS[color] ? 'key' : 'bomb', color }; });
  }
  return board;
}

export function createGame(board = generateBoard()) {
  if (!Array.isArray(board) || board.length !== 16) throw Error('Нужно 16 сейфов');
  return { board, strength: 100, keys: 0, opened: Array(16).fill(false), hinted: Array(16).fill(false), phase: 'playing', turns: 0, log: [] };
}

export function canAct(game, id, mode) {
  if (!Number.isInteger(id) || id < 0 || id >= 16 || !['open', 'hint'].includes(mode)) return false;
  if (game.phase !== 'playing' || game.opened[id] || mode === 'hint' && game.hinted[id]) return false;
  return game.strength >= (mode === 'hint' ? RULES.hintCost : RULES.openCost);
}

export function act(game, id, mode) {
  if (!canAct(game, id, mode)) return null;
  const item = game.board[id];
  const cost = mode === 'hint' ? RULES.hintCost : RULES.openCost + (item.kind === 'bomb' ? RULES.bombCost : 0);
  game.strength = Math.max(0, game.strength - cost);
  if (mode === 'hint') game.hinted[id] = true;
  else {
    game.opened[id] = true;
    if (item.kind === 'key') game.keys++;
  }
  game.turns++;
  if (game.keys === RULES.keyCount) game.phase = 'won';
  else if (game.strength < RULES.openCost) game.phase = 'lost';
  const entry = { id, mode, kind: item.kind, color: item.color, cost, strength: game.strength, turn: game.turns };
  game.log.unshift(entry);
  return entry;
}

export function counts(game, kind = 'key', onlyOpened = true) {
  return Object.fromEntries(COLORS.map(color => [color, game.board.filter((item, id) => item.kind === kind && item.color === color && (onlyOpened ? game.opened[id] : game.opened[id] || game.hinted[id])).length]));
}
