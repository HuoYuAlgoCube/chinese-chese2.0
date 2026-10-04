/**
 * 本地局面评估 + 简易搜索（用于给大模型提供参考分析，提升走法质量）
 * 说明：大模型擅长语言与常识，但缺乏精确算度；本地搜索擅长短距离算度。
 * 二者结合：本地搜索给出候选与评分，大模型做最终决策与解释。
 *
 * 搜索特性：
 *   - Alpha-Beta 剪枝 + 走法排序（吃子/将军优先）
 *   - 静态搜索（quiescence）：避免"吃子后又被吃回"的视界效应
 *   - 置换表（transposition table）：缓存已搜索局面，加速深层搜索
 */
import { SIDE, PIECE, PIECE_VALUE, OPPONENT } from '../core/constants.js';
import { generateLegalMoves, generatePieceMoves, isInCheck } from '../core/rules.js';

/** 兵/卒过河后的位置加分表（红方视角，row 0 为黑方底线） */
const PAWN_BONUS = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [10, 10, 10, 10, 10, 10, 10, 10, 10],
  [20, 20, 20, 25, 30, 25, 20, 20, 20],
  [30, 35, 40, 45, 50, 45, 40, 35, 30],
  [40, 45, 50, 55, 60, 55, 50, 45, 40],
  [40, 45, 50, 55, 60, 55, 50, 45, 40],
  [40, 45, 50, 55, 60, 55, 50, 45, 40],
];

/** 马/炮中心位置加分 */
const CENTER_BONUS = [
  [0, 1, 2, 3, 3, 3, 2, 1, 0],
  [1, 2, 3, 4, 4, 4, 3, 2, 1],
  [2, 3, 5, 6, 6, 6, 5, 3, 2],
  [2, 4, 6, 7, 8, 7, 6, 4, 2],
  [2, 4, 6, 8, 9, 8, 6, 4, 2],
  [2, 4, 6, 8, 9, 8, 6, 4, 2],
  [2, 4, 6, 7, 8, 7, 6, 4, 2],
  [2, 3, 5, 6, 6, 6, 5, 3, 2],
  [1, 2, 3, 4, 4, 4, 3, 2, 1],
  [0, 1, 2, 3, 3, 3, 2, 1, 0],
];

/** 帅/将安全：靠近底线中路更安全（红方视角的九宫格加分） */
const KING_SAFETY_BONUS = [
  // row 0..9（红方视角：r=9 为红方底线）
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 6, 8, 6, 0, 0, 0],
  [0, 0, 0, 8, 12, 8, 0, 0, 0],
  [0, 0, 0, 6, 10, 6, 0, 0, 0],
];
const KING_EXPOSED_PENALTY = 25;   // 缺士/缺相后的暴露风险基础分
const MOBILITY_WEIGHT = 1.2;       // 机动性权重

/**
 * 静态局面评估：正分对红方有利
 * 注意：位置表均以「红方视角」定义，黑方需把行镜像后再查表
 *
 * @param {object} board
 * @param {boolean} [withMobility] 是否统计机动性。机动性需对每枚棋子生成
 *   走法，代价较高；深层搜索/静态搜索中默认关闭，仅在根节点评估时开启。
 */
export function evaluateBoard(board, withMobility = false) {
  let score = 0;
  let redMobility = 0;
  let blackMobility = 0;
  // 双方士象存活数量（用于将帅安全）
  const guardCount = { red: 0, black: 0 };

  board.each((p, row, col) => {
    const base = PIECE_VALUE[p.type] || 0;
    let bonus = 0;

    // 统一换算到红方视角的行号（r=9 最靠近红方底线，r=0 最靠近黑方底线）
    const r = p.side === SIDE.RED ? row : 9 - row;

    if (p.type === PIECE.PAWN) {
      bonus += PAWN_BONUS[r][col];
    } else if (p.type === PIECE.HORSE || p.type === PIECE.CANNON) {
      bonus += CENTER_BONUS[r][col] * 0.5;
    } else if (p.type === PIECE.ROOK) {
      bonus += r * 2;
    } else if (p.type === PIECE.KING) {
      bonus += KING_SAFETY_BONUS[r][col];
    } else if (p.type === PIECE.ADVISOR || p.type === PIECE.ELEPHANT) {
      guardCount[p.side] += 1;
    }

    const val = base + bonus;
    score += p.side === SIDE.RED ? val : -val;

    if (withMobility) {
      // 机动性统计（伪合法走法数量，用于评估子力活性）
      const mobility = generatePieceMoves(board, row, col).length;
      if (p.side === SIDE.RED) redMobility += mobility;
      else blackMobility += mobility;
    }
  });

  // 机动性差（仅开启时计入）
  if (withMobility) score += (redMobility - blackMobility) * MOBILITY_WEIGHT;

  // 将帅安全：士象越少，暴露惩罚越重（缺士怕马、缺象怕炮）
  const redExposure = (4 - guardCount.red) * KING_EXPOSED_PENALTY;
  const blackExposure = (4 - guardCount.black) * KING_EXPOSED_PENALTY;
  score -= blackExposure;   // 黑方暴露对红方有利
  score += redExposure;     // 红方暴露对红方不利

  return score;
}

const GREAT_PIECE_TYPES = [PIECE.ROOK, PIECE.CANNON, PIECE.HORSE];

/**
 * 开局兑子惩罚：棋局早期主动用大子换大子（或大子换小亏）会损失先手与变化。
 * 目的：避免 AI 一上来就走"炮打马"这类看似等价、实则丧失主动的兑子。
 * @returns {number} 需要从评分中扣除的分数（>=0）
 */
function openingExchangePenalty(board, moverPiece, captured) {
  if (!captured) return 0;
  if (!GREAT_PIECE_TYPES.includes(captured.type)) return 0;

  // 统计棋盘上剩余的大子总数，越接近开局（子力越满）惩罚越重
  let greatTotal = 0;
  board.each((p) => {
    if (GREAT_PIECE_TYPES.includes(p.type)) greatTotal += 1;
  });
  // 满盘 12 个大子（每方车2炮2马2）
  const full = 12;
  const ratio = Math.max(0, Math.min(1, (greatTotal - 6) / (full - 6)));

  if (!GREAT_PIECE_TYPES.includes(moverPiece.type)) {
    // 用小兵换大子反而赚，不惩罚
    return 0;
  }
  // 大子换大子：开局阶段最多扣 60 分
  return Math.round(60 * ratio);
}

/** 局面转「行棋方视角」的评估分 */
function evalForSide(board, side) {
  const raw = evaluateBoard(board);
  return side === SIDE.RED ? raw : -raw;
}

/**
 * 静态搜索（quiescence）：只展开吃子，消除水平视界效应。
 * 若当前被将军，则展开全部走法以避免漏掉解将。
 */
function quiescence(board, side, alpha, beta, depth) {
  const inCheck = isInCheck(board, side);
  const standPat = evalForSide(board, side);

  if (!inCheck) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    // 限制静态搜索深度，避免爆炸
    if (depth <= 0) return alpha;
  }

  // 被将军时展开全部走法；否则只展开吃子走法
  const pseudo = inCheck
    ? generateLegalMoves(board, side)
    : generateCaptureMoves(board, side);

  if (pseudo.length === 0) {
    if (inCheck) return -100000 + (10 - depth) * 100; // 被将死
    return alpha;
  }

  // 吃子价值排序
  pseudo.sort((a, b) => {
    const va = a.captured ? (PIECE_VALUE[a.captured.type] || 0) : 0;
    const vb = b.captured ? (PIECE_VALUE[b.captured.type] || 0) : 0;
    return vb - va;
  });

  for (const m of pseudo) {
    const clone = board.clone();
    const moverPiece = clone.get(m.from.row, m.from.col);
    clone.set(m.to.row, m.to.col, moverPiece);
    clone.set(m.from.row, m.from.col, null);

    const score = -quiescence(clone, OPPONENT[side], -beta, -alpha, depth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

/** 生成仅包含吃子的合法走法 */
function generateCaptureMoves(board, side) {
  const result = [];
  for (const { row, col } of board.findPieces(side)) {
    for (const m of generatePieceMoves(board, row, col)) {
      const target = board.get(m.row, m.col);
      if (!target) continue; // 只保留吃子
      const clone = board.clone();
      clone.set(m.row, m.col, clone.get(row, col));
      clone.set(row, col, null);
      if (!isInCheck(clone, side)) {
        result.push({
          from: { row, col },
          to: { row: m.row, col: m.col },
          captured: { ...target },
        });
      }
    }
  }
  return result;
}

/** 置换表：key = 局面序列化 + 行棋方，value = {depth, score}（仅存固定深度结果） */
const TT_MAX = 60000;

function search(board, side, depth, alpha, beta, tt) {
  const key = board.serialize() + '|' + side;
  const cached = tt.get(key);
  if (cached && cached.depth >= depth) {
    return { score: cached.score, move: cached.move || null };
  }

  if (depth === 0) {
    // 进入静态搜索，避免在吃子交换中途截断
    return { score: quiescence(board, side, alpha, beta, 4) };
  }

  const moves = generateLegalMoves(board, side);
  if (moves.length === 0) {
    // 无棋可走：被将死或困毙，判为最大负分
    return { score: -100000 + (10 - depth) * 100 };
  }

  // 走法排序：吃子优先（按被吃子价值），提升剪枝效率
  moves.sort((a, b) => {
    const va = a.captured ? (PIECE_VALUE[a.captured.type] || 0) : 0;
    const vb = b.captured ? (PIECE_VALUE[b.captured.type] || 0) : 0;
    return vb - va;
  });

  let best = null;
  let bestScore = -Infinity;
  const origAlpha = alpha;

  for (const m of moves) {
    const clone = board.clone();
    const moverPiece = clone.get(m.from.row, m.from.col);
    clone.set(m.to.row, m.to.col, moverPiece);
    clone.set(m.from.row, m.from.col, null);

    const { score } = search(clone, OPPONENT[side], depth - 1, -beta, -alpha, tt);
    let val = -score;

    // 开局兑子惩罚：早期用大子换大子会损失先手与变化，轻微压低评分
    val -= openingExchangePenalty(board, moverPiece, m.captured);

    if (val > bestScore) {
      bestScore = val;
      best = m;
    }
    if (val > alpha) alpha = val;
    if (alpha >= beta) break; // 剪枝
  }

  // 仅缓存未因剪枝而失真的结果（alpha 未抬升即 fail-low，可视为上界；此处保守只存精确值）
  if (bestScore > origAlpha && bestScore < beta) {
    if (tt.size >= TT_MAX) tt.clear();
    tt.set(key, { depth, score: bestScore, move: best });
  }

  return { score: bestScore, move: best };
}

/**
 * 找到当前局面的最佳走法（本地搜索）
 * @param {object} game
 * @param {string} side
 * @param {number} depth 搜索深度（2 约等于看 1 回合，3 更强但更慢）
 */
export function findBestMove(game, side, depth = 2) {
  const board = game.board;
  const tt = new Map();
  const result = search(board, side, depth, -Infinity, Infinity, tt);
  return result.move ? { move: result.move, score: result.score } : null;
}

/**
 * 对给定走法清单打分排序（用于给清单标注优先级）
 * @returns {Map<string, number>} key "fromRow,fromCol,toRow,toCol" -> 分数
 */
export function scoreMoves(game, side, depth = 1) {
  return scoreBoardMoves(game.board, side, depth);
}

/**
 * 对给定局面的所有合法走法打分排序（纯棋盘入口，供主线程与 Web Worker 共用）
 * @param {Board} board 当前棋盘（不会被修改）
 * @param {string} side 行棋方
 * @param {number} depth 搜索深度
 * @returns {Map<string, number>} key "fromRow,fromCol,toRow,toCol" -> 分数
 */
export function scoreBoardMoves(board, side, depth = 1) {
  const scores = new Map();
  const moves = generateLegalMoves(board, side);
  // 同一次排序共用一个置换表，提升多走法评估的效率
  const tt = new Map();

  for (const m of moves) {
    const clone = board.clone();
    clone.set(m.to.row, m.to.col, clone.get(m.from.row, m.from.col));
    clone.set(m.from.row, m.from.col, null);

    let score;
    if (depth <= 0) {
      // 只看一步：走子后的静态评估，换算到行棋方视角
      score = evalForSide(clone, side);
    } else {
      // 走子后轮到对手，用搜索评估该方收益
      const { score: s } = search(clone, OPPONENT[side], depth, -Infinity, Infinity, tt);
      score = -s;
    }
    scores.set(`${m.from.row},${m.from.col},${m.to.row},${m.to.col}`, score);
  }
  return scores;
}

export { isInCheck };
