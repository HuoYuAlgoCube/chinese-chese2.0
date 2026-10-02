/**
 * 棋盘模型：负责棋子的存取、克隆、初始布局
 */
import {
  COLS,
  ROWS,
  SIDE,
  INITIAL_LAYOUT,
  INITIAL_SIDE_BY_ROW,
} from './constants.js';

export class Board {
  /**
   * @param {Array<Array<{type:string, side:string}|null>>} [grid]
   */
  constructor(grid) {
    if (grid) {
      this.grid = grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    } else {
      this.grid = Board.createInitialGrid();
    }
  }

  static createInitialGrid() {
    const grid = [];
    for (let row = 0; row < ROWS; row++) {
      const rowArr = [];
      for (let col = 0; col < COLS; col++) {
        const t = INITIAL_LAYOUT[row][col];
        rowArr.push(t ? { type: t, side: INITIAL_SIDE_BY_ROW(row) } : null);
      }
      grid.push(rowArr);
    }
    return grid;
  }

  clone() {
    return new Board(this.grid);
  }

  inBounds(row, col) {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
  }

  get(row, col) {
    if (!this.inBounds(row, col)) return null;
    return this.grid[row][col];
  }

  set(row, col, piece) {
    if (!this.inBounds(row, col)) return;
    this.grid[row][col] = piece ? { ...piece } : null;
  }

  /** 清空棋盘 */
  clear() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) this.grid[row][col] = null;
    }
  }

  /** 遍历所有棋子：cb(piece, row, col) */
  each(cb) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const p = this.grid[row][col];
        if (p) cb(p, row, col);
      }
    }
  }

  /** 查找棋子坐标列表；不传 side/type 则匹配全部 */
  findPieces(side, type) {
    const result = [];
    this.each((p, r, c) => {
      if ((!side || p.side === side) && (!type || p.type === type)) {
        result.push({ row: r, col: c, piece: p });
      }
    });
    return result;
  }

  /** 找到帅/将坐标 */
  findKing(side) {
    const list = this.findPieces(side, 'K');
    return list.length ? { row: list[0].row, col: list[0].col } : null;
  }

  /** 序列化为字符串（用于重复局面检测） */
  serialize() {
    let s = '';
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const p = this.grid[row][col];
        s += p ? (p.side === SIDE.RED ? p.type.toLowerCase() : p.type) : '.';
      }
    }
    return s;
  }
}
