/**
 * 中文记谱法（简化版，含「前/后」消歧）——单一事实来源。
 *
 * 供三处复用：
 *   - Game.describeMove（UI 走子记录）
 *   - engine.moveNotation（AI 提示词 / 解析）
 *   - 任何需要把走法转成中文记谱的地方
 *
 * 记谱规则（简化）：
 *   - 同一条竖线上有两枚同类型棋子时，用「前/后」区分（红方行号小者为「前」）。
 *   - 平走：`<棋子><起始列>平<目标列>`。
 *   - 直行棋子（车/炮/兵/将）用步数：`<棋子><起始列>进/退<步数>`。
 *   - 斜行棋子（马/相/仕）用目标列：`<棋子><起始列>进/退<目标列>`。
 *   - 红方用中文数字（一..九），黑方用阿拉伯数字（1..9）。
 */
import { SIDE, PIECE, PIECE_LABEL, ROWS } from './constants.js';

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const STRAIGHT_TYPES = [PIECE.ROOK, PIECE.CANNON, PIECE.PAWN, PIECE.KING];

/** 列号：红方自左往右为 九..一，黑方为 1..9 */
export function fileNo(side, col) {
  return side === SIDE.RED ? 9 - col : col + 1;
}

function num(side, n) {
  return side === SIDE.RED ? (CN_NUM[n - 1] || String(n)) : String(n);
}

/**
 * 生成一步棋的中文记谱。
 * @param {object} board Board 实例（用于判断同列同类型棋子，做前/后消歧）
 * @param {string} side 行棋方
 * @param {{row:number,col:number}} from
 * @param {{row:number,col:number}} to
 * @param {{type:string,side:string}} piece 走动的棋子
 * @returns {string}
 */
export function moveNotation(board, side, from, to, piece) {
  if (!piece) return '';
  const label = PIECE_LABEL[side][piece.type];
  const fromFile = fileNo(side, from.col);
  const toFile = fileNo(side, to.col);

  // 同一列上是否有同类型的己方棋子（需要「前/后」消歧）
  const sameFilePieces = [];
  for (let r = 0; r < ROWS; r++) {
    const p = board.get(r, from.col);
    if (p && p.side === side && p.type === piece.type) sameFilePieces.push(r);
  }
  let prefix = label;
  if (sameFilePieces.length >= 2 && piece.type !== PIECE.KING) {
    sameFilePieces.sort((a, b) => a - b);
    const idx = sameFilePieces.indexOf(from.row);
    // 红方行号更小者更靠近黑方，为「前」；黑方相反
    const forward = side === SIDE.RED ? idx === 0 : idx === sameFilePieces.length - 1;
    prefix = (forward ? '前' : '后') + label;
  }

  // 同列两枚以上兵时省略起始列（与「前/后」配合）
  const fileStr = piece.type === PIECE.PAWN && sameFilePieces.length >= 2 ? '' : num(side, fromFile);

  if (to.row === from.row) {
    return `${prefix}${fileStr}平${num(side, toFile)}`;
  }

  const forwardDir = side === SIDE.RED ? -1 : 1;
  const dir = Math.sign(to.row - from.row) === forwardDir ? '进' : '退';

  if (STRAIGHT_TYPES.includes(piece.type)) {
    const steps = Math.abs(to.row - from.row);
    return `${prefix}${fileStr}${dir}${num(side, steps)}`;
  }
  return `${prefix}${fileStr}${dir}${num(side, toFile)}`;
}

export { PIECE };
