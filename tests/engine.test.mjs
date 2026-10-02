/**
 * 核心引擎测试（Node 环境，直接用 node 运行）
 * 用法：node tests/engine.test.mjs
 */
import { Game, GAME_STATUS } from '../src/js/core/game.js';
import { SIDE, PIECE } from '../src/js/core/constants.js';
import { generatePieceMoves, isInCheck } from '../src/js/core/rules.js';

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

/* ---------- 初始局面 ---------- */
section('初始局面');
{
  const g = new Game();
  assert(g.turn === SIDE.RED, '红方先行');
  assert(g.getLegalMoves(SIDE.RED).length === 44, `红方初始合法走法 44 步（实际 ${g.getLegalMoves(SIDE.RED).length}）`);
  assert(g.getLegalMoves(SIDE.BLACK).length === 44, '黑方初始合法走法 44 步');
  assert(g.board.findKing(SIDE.RED).row === 9, '红帥在 row=9');
  assert(g.board.findKing(SIDE.BLACK).row === 0, '黑將在 row=0');
}

/* ---------- 基本走子 ---------- */
section('基本走子');
{
  const g = new Game();
  const r = g.move({ row: 7, col: 1 }, { row: 7, col: 4 }); // 炮（红）平中
  assert(r.ok, '红炮二平五合法');
  assert(g.turn === SIDE.BLACK, '走子后轮到黑方');
  assert(g.history.length === 1, '历史记录 1 条');

  const bad = g.move({ row: 0, col: 0 }, { row: 5, col: 0 });
  assert(!bad.ok, '黑车不能一步跨过多格（非法马步式移动被拒）');
}

/* ---------- 马腿 ---------- */
section('马蹩腿');
{
  const g = new Game();
  // 红马在 (9,1)，正上方 (8,1) 有红兵? 不，红兵在 row=6。先移动兵挡马腿
  const horse = generatePieceMoves(g.board, 9, 1);
  assert(horse.some((m) => m.row === 7 && m.col === 0), '马可走 (7,0)');
  assert(horse.some((m) => m.row === 7 && m.col === 2), '马可走 (7,2)');

  // 在 (8,1) 放一个棋子挡马腿
  g.board.set(8, 1, { type: PIECE.PAWN, side: SIDE.RED });
  const blocked = generatePieceMoves(g.board, 9, 1);
  assert(!blocked.some((m) => m.row === 7 && (m.col === 0 || m.col === 2)), '蹩马腿后不能走到 (7,0)/(7,2)');
}

/* ---------- 象不过河 ---------- */
section('象活动范围');
{
  const g = new Game();
  const ele = generatePieceMoves(g.board, 9, 2);
  assert(ele.every((m) => m.row >= 5), '红相不能过河');
  assert(ele.some((m) => m.row === 7 && m.col === 0), '红相可走 (7,0)');
  assert(ele.some((m) => m.row === 7 && m.col === 4), '红相可走 (7,4)');
}

/* ---------- 士/帅九宫 ---------- */
section('士与帅的九宫限制');
{
  const g = new Game();
  const adv = generatePieceMoves(g.board, 9, 3);
  assert(adv.every((m) => m.row >= 7 && m.col >= 3 && m.col <= 5), '仕仅在九宫内');
  const king = generatePieceMoves(g.board, 9, 4);
  assert(king.every((m) => m.row >= 7 && m.col >= 3 && m.col <= 5), '帥仅在九宫内');
}

/* ---------- 悔棋 ---------- */
section('悔棋');
{
  const g = new Game();
  g.move({ row: 7, col: 1 }, { row: 7, col: 4 });
  g.move({ row: 2, col: 1 }, { row: 2, col: 4 });
  assert(g.history.length === 2, '两步已记录');
  const n = g.undo(2);
  assert(n === 2, '悔棋两步');
  assert(g.turn === SIDE.RED, '悔棋后回到红方');
  assert(g.board.get(7, 1).type === PIECE.CANNON, '红炮回到原位');
  assert(g.board.get(2, 1).type === PIECE.CANNON, '黑炮回到原位');
}

/* ---------- 将军与绝杀（构造简易杀局）---------- */
section('将军判定');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(0, 0, { type: PIECE.ROOK, side: SIDE.RED }); // 红车与黑將同在第 0 行
  assert(isInCheck(g.board, SIDE.BLACK), '红车与黑將同一行，黑方应被将军');

  // 布局：将帅同列但有子隔开，双方均不被将军
  const g2 = new Game();
  g2.board.clear();
  g2.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g2.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g2.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK }); // 置于同一列隔开将帅
  assert(isInCheck(g2.board, SIDE.RED) === false, '红方未被将军（有子隔开将帅）');
  assert(isInCheck(g2.board, SIDE.BLACK) === false, '黑方未被将军（有子隔开将帅）');
}

/* ---------- 将帅照面（飞将）---------- */
section('将帅照面');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  const moves = generatePieceMoves(g.board, 9, 4);
  assert(moves.some((m) => m.row === 0 && m.col === 4), '同列无遮挡时帥可「飞将」吃將');
  assert(isInCheck(g.board, SIDE.RED), '将帅照面时视为红方被将军（非法状态）');
}

/* ---------- 吃子 ---------- */
section('吃子');
{
  const g = new Game();
  // 红车(9,0) 上移到 (8,0)，未吃子
  const r = g.move({ row: 9, col: 0 }, { row: 8, col: 0 });
  assert(r.ok, '红车进一');
  assert(r.captured === null, '未吃子');

  // 黑车不能吃己方棋子（(3,0) 为黑卒）
  g.turn = SIDE.BLACK;
  const r2 = g.move({ row: 0, col: 0 }, { row: 3, col: 0 });
  assert(!r2.ok, '黑车不能吃己方棋子（(3,0) 为黑卒）');
}

/* ---------- 兵过河横走 ---------- */
section('兵过河后横走');
{
  const g = new Game();
  g.board.clear();
  // 将帅错开列，避免把帅照面干扰兵走法
  g.board.set(9, 3, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(4, 4, { type: PIECE.PAWN, side: SIDE.RED }); // 已过河的红兵（row≤4）
  g.turn = SIDE.RED;

  const left = g.move({ row: 4, col: 4 }, { row: 4, col: 3 });
  assert(left.ok, '红兵过河后可横走');
  assert(g.turn === SIDE.BLACK, '走子后轮到黑方');
}

/* ---------- 兵未过河不能横走 ---------- */
section('兵未过河不能横走');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.RED }); // 未过河，兼隔将帅
  g.turn = SIDE.RED;
  const moves = g.getLegalMoves(SIDE.RED).filter((m) => m.from.row === 5 && m.from.col === 4);
  assert(moves.every((m) => m.to.col === 4), '未过河的红兵只能直走，不能横走');
}

/* ---------- 吃子（黑卒吃红兵） ---------- */
section('黑卒吃红兵');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 0, { type: PIECE.PAWN, side: SIDE.BLACK });
  g.board.set(6, 0, { type: PIECE.PAWN, side: SIDE.RED });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK }); // 隔开将帅，避免照面
  g.turn = SIDE.BLACK;

  const r = g.move({ row: 5, col: 0 }, { row: 6, col: 0 });
  assert(r.ok, '黑卒吃红兵');
  assert(r.captured && r.captured.type === PIECE.PAWN, '吃到的棋子是兵');
  assert(r.captured && r.captured.side === SIDE.RED, '吃到的是红方棋子');
}

/* ---------- 无合法走法判负 ---------- */
section('绝杀判定');
{
  const g = new Game();
  g.board.clear();
  // 红帥(9,4)，黑車在(9,0) 与 (8,4) 形成杀
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(8, 4, { type: PIECE.ROOK, side: SIDE.BLACK }); // 黑车贴脸将军
  g.board.set(9, 0, { type: PIECE.ROOK, side: SIDE.BLACK }); // 封住左路
  g.board.set(9, 8, { type: PIECE.ROOK, side: SIDE.BLACK }); // 封住右路
  g.turn = SIDE.RED;
  // 红帥被(8,4)黑车将军，且左右被车封住，无法移动 -> 绝杀
  const hasMove = g.getLegalMoves(SIDE.RED).length > 0;
  assert(!hasMove, '红方无合法走法（绝杀）');
  assert(isInCheck(g.board, SIDE.RED), '红方处于被将军状态');
}

/* ---------- 记谱 ---------- */
section('中文记谱');
{
  const g = new Game();
  const desc = g.describeMove({ row: 7, col: 1 }, { row: 7, col: 4 },
    { type: PIECE.CANNON, side: SIDE.RED }, null);
  assert(desc.includes('炮'), '记谱含「炮」: ' + desc);
  assert(desc.includes('平'), '平走含「平」: ' + desc);
}

/* ---------- 汇总 ---------- */
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}  失败: ${fail}`);
console.log('='.repeat(40));
process.exit(fail > 0 ? 1 : 0);
