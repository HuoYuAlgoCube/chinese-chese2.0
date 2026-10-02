/**
 * 本地搜索质量测试：绝杀识别、避免送子、置换表一致性
 * 用法：node tests/search.test.mjs
 */
import { Game } from '../src/js/core/game.js';
import { SIDE, PIECE } from '../src/js/core/constants.js';
import { findBestMove, evaluateBoard, scoreMoves } from '../src/js/ai/search.js';
import { maybeForcedMate } from '../src/js/ai/engine.js';
import { rankMovesBySearch } from '../src/js/ai/engine.js';

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

/* ---------- 一步绝杀（车切入 + 车封底线） ---------- */
section('一步绝杀');
{
  // 黑将 (0,4)；红车 A 在 (1,0)，走到 (1,4) 将军；
  // 红车 B 在 (0,0) 封锁底线逃生格。红帅 (9,4) 与黑将同列形成飞将约束。
  const g = new Game();
  g.board.clear();
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(1, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.board.set(0, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.turn = SIDE.RED;

  const best = findBestMove(g, SIDE.RED, 2);
  // 该局面下红方存在多于一处的绝杀（含直接吃将），只要引擎找到“绝杀级”着法即可
  const foundMate = !!(best && best.score > 90000);
  assert(foundMate, `红方找到绝杀着（实际 (${best?.move?.from.row},${best?.move?.from.col})->(${best?.move?.to.row},${best?.move?.to.col})，score=${best?.score}）`);
  assert(best && best.score > 90000, `绝杀评分接近最大（实际 ${best?.score}）`);
}

/* ---------- 不白白送车 ---------- */
section('避免白送大子');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });
  // 红车 (5,0) 与黑车 (5,8) 同排在 row5，中间仅一个兵；(5,4) 在双方车火范围内
  g.board.set(5, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.board.set(5, 8, { type: PIECE.ROOK, side: SIDE.BLACK });
  g.turn = SIDE.RED;

  const best = findBestMove(g, SIDE.RED, 3);
  const walksIntoCapture = best && best.move.to.row === 5 && best.move.to.col === 4;
  assert(!walksIntoCapture, '红车不会主动走到黑车口中');
}

/* ---------- 置换表不改动搜索结果（确定性） ---------- */
section('置换表一致性');
{
  const g = new Game();
  g.move({ row: 7, col: 1 }, { row: 7, col: 4 });
  g.move({ row: 0, col: 1 }, { row: 2, col: 2 });
  g.move({ row: 9, col: 1 }, { row: 7, col: 2 });

  const a = findBestMove(g, SIDE.RED, 3);
  const b = findBestMove(g, SIDE.RED, 3);
  const same = a && b
    && a.move.from.row === b.move.from.row && a.move.from.col === b.move.from.col
    && a.move.to.row === b.move.to.row && a.move.to.col === b.move.to.col;
  assert(same, '相同局面两次搜索给出相同最佳着（确定性）');
}

/* ---------- 机动性与将帅安全 ---------- */
section('机动性与将帅安全');
{
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });
  g.board.set(7, 0, { type: PIECE.ROOK, side: SIDE.RED });
  assert(evaluateBoard(g.board, true) > 300, '红多一车（含机动性）评估为正');

  // 士象缺失惩罚：补全士象的一方应比缺士缺象的一方评分更高
  const guarded = new Game();
  guarded.board.clear();
  guarded.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  guarded.board.set(9, 3, { type: PIECE.ADVISOR, side: SIDE.RED });
  guarded.board.set(9, 5, { type: PIECE.ADVISOR, side: SIDE.RED });
  guarded.board.set(9, 2, { type: PIECE.ELEPHANT, side: SIDE.RED });
  guarded.board.set(9, 6, { type: PIECE.ELEPHANT, side: SIDE.RED });
  guarded.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  guarded.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });

  const exposed = new Game();
  exposed.board.clear();
  exposed.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  exposed.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  exposed.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });

  const sGuarded = evaluateBoard(guarded.board, false);
  const sExposed = evaluateBoard(exposed.board, false);
  assert(sGuarded > sExposed, `士象齐全方评分高于敞露方（有士=${sGuarded}，无士=${sExposed}）`);
}

/* ---------- scoreMoves 排序：绝杀着应排最高 ---------- */
section('走法评分排序');
{
  const g = new Game();
  g.board.clear();
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(1, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.board.set(0, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.turn = SIDE.RED;

  const scores = scoreMoves(g, SIDE.RED, 2);
  const mateScore = scores.get('1,0,1,4');
  const maxScore = Math.max(...scores.values());
  assert(mateScore === maxScore, `绝杀着 (1,0)->(1,4) 评分为最高（${mateScore} vs max ${maxScore}）`);
}

/* ---------- 本地引擎绝杀短路（省去 LLM 调用） ---------- */
section('本地引擎绝杀短路');
{
  const g = new Game();
  g.board.clear();
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(1, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.board.set(0, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.turn = SIDE.RED;

  const { ordered } = rankMovesBySearch(g, SIDE.RED, 2);
  const mate = maybeForcedMate(g, ordered);
  assert(mate && mate.localMate === true, '存在绝杀着时返回短路结果（localMate=true）');
  assert(mate && mate.to && mate.to.row === 0 && mate.to.col === 4, `短路着法为目标绝杀着（实际 (${mate?.to?.row},${mate?.to?.col})）`);

  // 非绝杀局面不应短路
  const g2 = new Game();
  const { ordered: ordered2 } = rankMovesBySearch(g2, SIDE.RED, 2);
  const noMate = maybeForcedMate(g2, ordered2);
  assert(noMate === null, '普通开局局面不触发绝杀短路');
}

/* ---------- 结果输出 ---------- */
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}  失败: ${fail}`);
console.log('='.repeat(40));
if (fail > 0) process.exit(1);
