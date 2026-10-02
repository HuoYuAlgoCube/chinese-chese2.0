/**
 * AI 引擎与本地搜索测试
 * 用法：node tests/ai.test.mjs
 */
import { Game } from '../src/js/core/game.js';
import { SIDE, PIECE } from '../src/js/core/constants.js';
import { findBestMove, evaluateBoard } from '../src/js/ai/search.js';
import {
  buildBoardText,
  buildMovesText,
  buildHistoryText,
  rankMovesBySearch,
  moveNotation,
  parseMoveFromText,
  parseIndexFromText,
  matchByNotation,
} from '../src/js/ai/engine.js';
import { isInCheck } from '../src/js/core/rules.js';

let pass = 0, fail = 0;
const t = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.error(`  ✗ ${msg}`); } };
const section = (n) => console.log(`\n== ${n} ==`);

/* ---------- 局面评估 ---------- */
section('局面评估');
{
  t(evaluateBoard(new Game().board) === 0, '初始局面评估为 0（双方均势）');

  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });
  g.board.set(5, 0, { type: PIECE.ROOK, side: SIDE.RED }); // 红多一车
  t(evaluateBoard(g.board) > 400, '红方多一车时评估明显为正');
}

/* ---------- 本地搜索：吃子 ---------- */
section('本地搜索 - 吃子');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK }); // 隔将帅
  g.board.set(4, 0, { type: PIECE.ROOK, side: SIDE.BLACK });
  g.board.set(4, 7, { type: PIECE.ROOK, side: SIDE.RED });   // 可被黑车吃
  g.turn = SIDE.BLACK;
  const best = findBestMove(g, SIDE.BLACK, 2);
  t(best && best.move.to.row === 4 && best.move.to.col === 7, '黑车能吃到红车时会选择吃');
}

/* ---------- 本地搜索：避免送子 ---------- */
section('本地搜索 - 避免送大子');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });
  // 红车(7,0)；黑车(4,0) 同一列，若红车走到 (6,0) 会被黑车直吃
  g.board.set(4, 0, { type: PIECE.ROOK, side: SIDE.BLACK });
  g.board.set(9, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.turn = SIDE.RED;
  const best = findBestMove(g, SIDE.RED, 2);
  // 只要不是走到黑车能吃的位置即可
  const bad = best.move.to.row === 6 && best.move.to.col === 0;
  t(!bad, '红车不会主动走到被黑车白吃的位置');
}

/* ---------- 本地搜索：解将 ---------- */
section('本地搜索 - 解将');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });
  g.board.set(9, 2, { type: PIECE.ROOK, side: SIDE.BLACK }); // 横向将军红帅
  g.board.set(8, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.turn = SIDE.RED;
  t(isInCheck(g.board, SIDE.RED), '红方处于被将军状态');
  const best = findBestMove(g, SIDE.RED, 2);
  const c = g.board.clone();
  c.set(best.move.to.row, best.move.to.col, c.get(best.move.from.row, best.move.from.col));
  c.set(best.move.from.row, best.move.from.col, null);
  t(!isInCheck(c, SIDE.RED), '搜索给出的走法能解除将军');
}

/* ---------- 中文记谱 ---------- */
section('中文记谱');
{
  const g = new Game();
  const n = moveNotation(g, SIDE.RED, { row: 7, col: 1 }, { row: 7, col: 4 }, { type: PIECE.CANNON, side: SIDE.RED });
  t(/炮/.test(n) && /平/.test(n), `红方记谱含「炮」「平」: ${n}`);

  const nb = moveNotation(g, SIDE.BLACK, { row: 2, col: 1 }, { row: 2, col: 4 }, { type: PIECE.CANNON, side: SIDE.BLACK });
  t(/砲/.test(nb) && /[0-9]/.test(nb), `黑方记谱用阿拉伯数字: ${nb}`);
}

/* ---------- 走法清单排序 ---------- */
section('走法清单（搜索排序）');
{
  const g = new Game();
  g.move({ row: 7, col: 1 }, { row: 7, col: 4 });
  g.move({ row: 0, col: 1 }, { row: 2, col: 2 });
  g.move({ row: 9, col: 1 }, { row: 7, col: 2 });

  const { ordered, annotations } = rankMovesBySearch(g, SIDE.BLACK, 2);
  t(ordered.length > 0, '返回排序后的走法列表');
  t(ordered[0].score >= ordered[ordered.length - 1].score, '走法按评分从高到低排列');
  t(annotations.get(ordered[0].key) === '本地引擎评分最高', '第一条被标注为评分最高');

  const text = buildMovesText(g, SIDE.BLACK, annotations, ordered);
  const firstLine = text.split('\n')[0];
  t(firstLine.includes('本地引擎评分最高'), '清单首行即含评分最高标注');
  t(/坐标\(\d,\d\)→\(\d,\d\)/.test(firstLine), '清单含精确坐标');
}

/* ---------- 局面文本 ---------- */
section('局面文本');
{
  const g = new Game();
  const txt = buildBoardText(g);
  t(txt.includes('行 0') && txt.includes('行 9'), '包含 0-9 行');
  t(txt.includes('車') && txt.includes('俥'), '包含双方棋子');
  t(txt.includes('列:'), '包含列号标注');
}

/* ---------- 历史文本 ---------- */
section('历史文本');
{
  const g = new Game();
  t(buildHistoryText(g).includes('开局'), '开局时提示尚无记录');
  g.move({ row: 7, col: 1 }, { row: 7, col: 4 });
  g.move({ row: 0, col: 1 }, { row: 2, col: 2 });
  const h = buildHistoryText(g);
  t(h.includes('红方') && h.includes('黑方'), '记录包含双方');
  t(/1\./.test(h), '记录含回合编号');
}

/* ---------- 返回解析鲁棒性 ---------- */
section('AI 返回解析');
{
  t(parseMoveFromText('{"fromRow":7,"fromCol":1,"toRow":7,"toCol":4}')?.toCol === 4, '解析标准 JSON');
  t(parseMoveFromText('```json\n{"fromRow":0,"fromCol":0,"toRow":1,"toCol":0}\n```')?.fromRow === 0, '解析 markdown 包裹的 JSON');
  t(parseMoveFromText('[[7,1,7,4]]') === null || parseMoveFromText('[[7,1,7,4]]'), '数组格式不崩溃');
  t(parseMoveFromText('[7,1,7,4]')?.toRow === 7, '解析扁平数组');
  t(parseMoveFromText('从 (7,1) 到 (7,4)')?.toCol === 4, '解析自然语言坐标');
  t(parseMoveFromText('"fromRow": 7, "fromCol": 1, "toRow": 7, "toCol": 4')?.toRow === 7, '解析松散键值');
  t(parseMoveFromText('完全无关的文本') === null, '无法解析时返回 null');
  t(parseMoveFromText('{"fromRow":7,"fromCol":1,"toRow":7,"toCol":4,"reason":"中炮"}')?.reason === '中炮', '提取 reason');
}

/* ---------- 序号解析（最稳的定位方式） ---------- */
section('序号解析');
{
  t(parseIndexFromText('{"index": 5}') === 5, '解析 JSON index');
  t(parseIndexFromText('{"index":5,"reason":"x"}') === 5, '解析带 reason 的 index');
  t(parseIndexFromText('选择第 12 步') === 12, '解析中文"第 12 步"');
  t(parseIndexFromText('第3条') === 3, '解析"第3条"');
  t(parseIndexFromText('12.') === 12, '解析裸序号');
  t(parseIndexFromText('炮八平五') === null, '无序号时返回 null');
}

/* ---------- 中文记谱回查 ---------- */
section('中文记谱回查');
{
  const g = new Game();
  const { ordered, annotations } = rankMovesBySearch(g, SIDE.RED, 2);
  const text = buildMovesText(g, SIDE.RED, annotations, ordered);
  const firstLine = text.split('\n')[0];
  const notation = firstLine.replace(/^\s*\d+\.\s*/, '').split(/\s/)[0];
  const hit = matchByNotation(g, SIDE.RED, '我建议走' + notation, ordered);
  t(hit !== null, `能按记谱回查: ${notation}`);
  t(hit && hit.from.row === ordered[0].move.from.row, '回查结果与清单首条一致');
}

/* ---------- 走法清单含序号 ---------- */
section('走法清单序号');
{
  const g = new Game();
  const { ordered, annotations } = rankMovesBySearch(g, SIDE.RED, 2);
  const text = buildMovesText(g, SIDE.RED, annotations, ordered);
  const lines = text.split('\n');
  t(/^\s*1\.\s/.test(lines[0]), '首行以"1."开头');
  t(/^\s*2\.\s/.test(lines[1]), '次行以"2."开头');
}

/* ---------- 小结 ---------- */
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}  失败: ${fail}`);
console.log('='.repeat(40));
process.exit(fail > 0 ? 1 : 0);
