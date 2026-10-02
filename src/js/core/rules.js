/**
 * 走子规则引擎：生成合法走法、将军/绝杀判定
 */
import { SIDE, OPPONENT, PIECE, ROWS, COLS } from './constants.js';

const inBoard = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

/** 九宫格范围 */
function inPalace(side, r, c) {
  if (c < 3 || c > 5) return false;
  if (side === SIDE.RED) return r >= 7 && r <= 9;
  return r >= 0 && r <= 2;
}

/** 己方半场（用于象/相） */
function inOwnHalf(side, r) {
  if (side === SIDE.RED) return r >= 5;
  return r <= 4;
}

/**
 * 生成某个棋子的伪合法走法（不考虑己方被将军）
 * @returns {Array<{row:number,col:number}>}
 */
export function generatePieceMoves(board, row, col) {
  const piece = board.get(row, col);
  if (!piece) return [];
  const { type, side } = piece;
  const moves = [];

  const push = (r, c) => {
    if (!inBoard(r, c)) return false;
    const target = board.get(r, c);
    if (target && target.side === side) return false;
    moves.push({ row: r, col: c });
    return !target; // 可继续前进（空格）
  };

  switch (type) {
    case PIECE.ROOK: {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dr, dc] of dirs) {
        let r = row + dr;
        let c = col + dc;
        while (inBoard(r, c)) {
          const t = board.get(r, c);
          if (!t) {
            moves.push({ row: r, col: c });
          } else {
            if (t.side !== side) moves.push({ row: r, col: c });
            break;
          }
          r += dr;
          c += dc;
        }
      }
      break;
    }

    case PIECE.CANNON: {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dr, dc] of dirs) {
        let r = row + dr;
        let c = col + dc;
        let jumped = false;
        while (inBoard(r, c)) {
          const t = board.get(r, c);
          if (!jumped) {
            if (!t) {
              moves.push({ row: r, col: c });
            } else {
              jumped = true; // 找到炮架
            }
          } else {
            if (t) {
              if (t.side !== side) moves.push({ row: r, col: c });
              break;
            }
          }
          r += dr;
          c += dc;
        }
      }
      break;
    }

    case PIECE.HORSE: {
      const cands = [
        [row - 2, col - 1, row - 1, col],
        [row - 2, col + 1, row - 1, col],
        [row + 2, col - 1, row + 1, col],
        [row + 2, col + 1, row + 1, col],
        [row - 1, col - 2, row, col - 1],
        [row + 1, col - 2, row, col - 1],
        [row - 1, col + 2, row, col + 1],
        [row + 1, col + 2, row, col + 1],
      ];
      for (const [r, c, lr, lc] of cands) {
        if (!inBoard(r, c)) continue;
        if (board.get(lr, lc)) continue; // 蹩马腿
        const t = board.get(r, c);
        if (t && t.side === side) continue;
        moves.push({ row: r, col: c });
      }
      break;
    }

    case PIECE.ELEPHANT: {
      const cands = [
        [row - 2, col - 2, row - 1, col - 1],
        [row - 2, col + 2, row - 1, col + 1],
        [row + 2, col - 2, row + 1, col - 1],
        [row + 2, col + 2, row + 1, col + 1],
      ];
      for (const [r, c, lr, lc] of cands) {
        if (!inBoard(r, c)) continue;
        if (!inOwnHalf(side, r)) continue; // 象不过河
        if (board.get(lr, lc)) continue;   // 塞象眼
        const t = board.get(r, c);
        if (t && t.side === side) continue;
        moves.push({ row: r, col: c });
      }
      break;
    }

    case PIECE.ADVISOR: {
      const cands = [
        [row - 1, col - 1],
        [row - 1, col + 1],
        [row + 1, col - 1],
        [row + 1, col + 1],
      ];
      for (const [r, c] of cands) {
        if (!inPalace(side, r, c)) continue;
        const t = board.get(r, c);
        if (t && t.side === side) continue;
        moves.push({ row: r, col: c });
      }
      break;
    }

    case PIECE.KING: {
      const cands = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ];
      for (const [r, c] of cands) {
        if (!inPalace(side, r, c)) continue;
        const t = board.get(r, c);
        if (t && t.side === side) continue;
        moves.push({ row: r, col: c });
      }
      // 将帅照面（飞将）：直线无遮挡时可直接吃对方将
      const opp = OPPONENT[side];
      const oppKing = board.findKing(opp);
      if (oppKing && oppKing.col === col) {
        let blocked = false;
        const [from, to] = row < oppKing.row ? [row + 1, oppKing.row] : [oppKing.row + 1, row];
        for (let r = from; r < to; r++) {
          if (board.get(r, col)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) moves.push({ row: oppKing.row, col: oppKing.col });
      }
      break;
    }

    case PIECE.PAWN: {
      const forward = side === SIDE.RED ? -1 : 1;
      const r1 = row + forward;
      if (inBoard(r1, col)) {
        const t = board.get(r1, col);
        if (!t || t.side !== side) moves.push({ row: r1, col: col });
      }
      // 过河后可左右移动
      const crossedRiver =
        side === SIDE.RED ? row <= 4 : row >= 5;
      if (crossedRiver) {
        for (const dc of [-1, 1]) {
          const c = col + dc;
          if (!inBoard(row, c)) continue;
          const t = board.get(row, c);
          if (!t || t.side !== side) moves.push({ row: row, col: c });
        }
      }
      break;
    }

    default:
      break;
  }

  return moves;
}

/**
 * 判断某方是否被将军
 */
export function isInCheck(board, side) {
  const king = board.findKing(side);
  if (!king) return true; // 将没了视为被将死
  const opp = OPPONENT[side];
  // 检查敌方所有棋子能否吃到将
  const oppPieces = board.findPieces(opp);
  for (const { row, col } of oppPieces) {
    const moves = generatePieceMoves(board, row, col);
    for (const m of moves) {
      if (m.row === king.row && m.col === king.col) return true;
    }
  }
  return false;
}

/**
 * 生成某方所有合法走法（过滤掉会导致己方被将军的走法）
 * @returns {Array<{from:{row,col}, to:{row,col}, captured:object|null}>}
 */
export function generateLegalMoves(board, side) {
  const result = [];
  const pieces = board.findPieces(side);
  for (const { row, col } of pieces) {
    const moves = generatePieceMoves(board, row, col);
    for (const m of moves) {
      const captured = board.get(m.row, m.col);
      const clone = board.clone();
      clone.set(m.row, m.col, clone.get(row, col));
      clone.set(row, col, null);
      if (!isInCheck(clone, side)) {
        result.push({
          from: { row, col },
          to: { row: m.row, col: m.col },
          captured: captured ? { ...captured } : null,
        });
      }
    }
  }
  return result;
}

/**
 * 判断某方是否还有合法走法（无则为绝杀/困毙，判负）
 */
export function hasAnyLegalMove(board, side) {
  const pieces = board.findPieces(side);
  for (const { row, col } of pieces) {
    const moves = generatePieceMoves(board, row, col);
    for (const m of moves) {
      const clone = board.clone();
      clone.set(m.row, m.col, clone.get(row, col));
      clone.set(row, col, null);
      if (!isInCheck(clone, side)) return true;
    }
  }
  return false;
}

/**
 * 判断两个坐标是否相等
 */
export function samePos(a, b) {
  return a && b && a.row === b.row && a.col === b.col;
}
