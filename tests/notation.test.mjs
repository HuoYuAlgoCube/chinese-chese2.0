/**
 * 中文记谱测试（core/notation.js）
 * 用法：node tests/notation.test.mjs
 */
import { Game } from '../src/js/core/game.js';
import { Board } from '../src/js/core/board.js';
import { SIDE, PIECE } from '../src/js/core/constants.js';
import { moveNotation, fileNo } from '../src/js/core/notation.js';

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

function section(name) {
  console.log(`\n== ${name} ==`);
}

/* ---------- 列号换算 ---------- */
section('列号换算');
{
  assert(fileNo(SIDE.RED, 0) === 9, '红方 col=0 → 九');
  assert(fileNo(SIDE.RED, 8) === 1, '红方 col=8 → 一');
  assert(fileNo(SIDE.BLACK, 0) === 1, '黑方 col=0 → 1');
  assert(fileNo(SIDE.BLACK, 8) === 9, '黑方 col=8 → 9');
}

/* ---------- 开局记谱（红炮平中） ---------- */
section('开局记谱');
{
  const g = new Game();
  const n = g.describeMove({ row: 7, col: 1 }, { row: 7, col: 4 }, { type: PIECE.CANNON, side: SIDE.RED });
  assert(n === '炮八平五', `红炮从 (7,1) 到 (7,4) 记为「炮八平五」（实际 ${n}）`);
}

/* ---------- 直行棋子（车/炮/兵/将）用步数 ---------- */
section('直行棋子用步数');
{
  const g = new Game();
  const rook = g.describeMove({ row: 9, col: 0 }, { row: 7, col: 0 }, { type: PIECE.ROOK, side: SIDE.RED });
  assert(rook === '俥九进二', `红车直行两步记为「俥九进二」（实际 ${rook}）`);

  const pawn = g.describeMove({ row: 6, col: 0 }, { row: 5, col: 0 }, { type: PIECE.PAWN, side: SIDE.RED });
  assert(pawn === '兵九进一', `红兵前进一步记为「兵九进一」（实际 ${pawn}）`);

  const blackPawn = g.describeMove({ row: 3, col: 0 }, { row: 4, col: 0 }, { type: PIECE.PAWN, side: SIDE.BLACK });
  assert(blackPawn === '卒1进1', `黑卒前进一步记为「卒1进1」（实际 ${blackPawn}）`);
}

/* ---------- 斜行棋子（马/相/仕）用目标列 ---------- */
section('斜行棋子用目标列');
{
  const g = new Game();
  const horse = g.describeMove({ row: 9, col: 1 }, { row: 7, col: 2 }, { type: PIECE.HORSE, side: SIDE.RED });
  assert(horse.includes('进') && horse.includes('七'), `红马跳至 col=2 用目标列「七」（实际 ${horse}）`);

  const elephant = g.describeMove({ row: 9, col: 2 }, { row: 7, col: 4 }, { type: PIECE.ELEPHANT, side: SIDE.RED });
  assert(elephant.includes('进') && elephant.includes('五'), `红相飞中用目标列「五」（实际 ${elephant}）`);
}

/* ---------- 前/后 消歧 ---------- */
section('前后消歧');
{
  const board = new Board();
  board.clear();
  board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  // 同一列 (col=0) 两枚红车：(9,0) 与 (7,0)
  board.set(9, 0, { type: PIECE.ROOK, side: SIDE.RED });
  board.set(7, 0, { type: PIECE.ROOK, side: SIDE.RED });

  // 红方 (7,0) 更靠近黑方（row 更小）= 前
  const front = moveNotation(board, SIDE.RED, { row: 7, col: 0 }, { row: 6, col: 0 }, { type: PIECE.ROOK, side: SIDE.RED });
  assert(front.startsWith('前俥'), `红方 (7,0) 车为「前俥」（实际 ${front}）`);

  const back = moveNotation(board, SIDE.RED, { row: 9, col: 0 }, { row: 8, col: 0 }, { type: PIECE.ROOK, side: SIDE.RED });
  assert(back.startsWith('后俥'), `红方 (9,0) 车为「后俥」（实际 ${back}）`);
}

/* ---------- Game.describeMove 与 notation.moveNotation 一致 ---------- */
section('单一事实来源一致性');
{
  const g = new Game();
  const from = { row: 7, col: 1 };
  const to = { row: 7, col: 4 };
  const piece = { type: PIECE.CANNON, side: SIDE.RED };
  const a = g.describeMove(from, to, piece);
  const b = moveNotation(g.board, SIDE.RED, from, to, piece);
  assert(a === b, `describeMove 与 moveNotation 结果一致（${a}）`);
}

/* ---------- 结果输出 ---------- */
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}  失败: ${fail}`);
console.log('='.repeat(40));
if (fail > 0) process.exit(1);
