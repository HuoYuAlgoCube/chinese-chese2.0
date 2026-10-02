/**
 * Game：游戏状态机
 * 负责：走子、悔棋、胜负判定、走子历史、重复局面检测
 * 通过事件回调把变化通知 UI 层
 */
import { Board } from './board.js';
import {
  SIDE,
  OPPONENT,
  PIECE_LABEL,
  PIECE,
} from './constants.js';
import {
  generateLegalMoves,
  isInCheck,
  hasAnyLegalMove,
} from './rules.js';
import { moveNotation } from './notation.js';

export const GAME_STATUS = {
  PLAYING: 'playing',
  RED_WIN: 'red_win',
  BLACK_WIN: 'black_win',
  DRAW: 'draw',
};

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = new Board();
    this.turn = SIDE.RED; // 红先行
    this.status = GAME_STATUS.PLAYING;
    this.history = []; // 走子历史（用于悔棋）
    this.positionCounts = {}; // 局面重复次数
    this.winner = null;
    this.winReason = '';
    this.moveNumber = 0;
    this._recordPosition();
  }

  _recordPosition() {
    const key = this.board.serialize() + '|' + this.turn;
    this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
    return this.positionCounts[key];
  }

  _unrecordPosition() {
    const key = this.board.serialize() + '|' + this.turn;
    if (this.positionCounts[key]) {
      this.positionCounts[key] -= 1;
      if (this.positionCounts[key] <= 0) delete this.positionCounts[key];
    }
  }

  get currentSide() {
    return this.turn;
  }

  get isOver() {
    return this.status !== GAME_STATUS.PLAYING;
  }

  /**
   * 获取某方合法走法列表
   */
  getLegalMoves(side = this.turn) {
    return generateLegalMoves(this.board, side);
  }

  /**
   * 获取某个棋子的合法目标位置
   */
  getMovesForPiece(row, col) {
    const piece = this.board.get(row, col);
    if (!piece || piece.side !== this.turn || this.isOver) return [];
    const all = this.getLegalMoves(this.turn);
    return all
      .filter((m) => m.from.row === row && m.from.col === col)
      .map((m) => m.to);
  }

  /**
   * 执行走子
   * @param {{row:number,col:number}} from
   * @param {{row:number,col:number}} to
   * @returns {{ok:boolean, error?:string, captured?:object, check?:boolean}}
   */
  move(from, to) {
    if (this.isOver) return { ok: false, error: '对局已结束' };
    const piece = this.board.get(from.row, from.col);
    if (!piece) return { ok: false, error: '该位置没有棋子' };
    if (piece.side !== this.turn) return { ok: false, error: '不是该方走子' };

    const legal = this.getLegalMoves(this.turn);
    const found = legal.find(
      (m) => m.from.row === from.row && m.from.col === from.col &&
             m.to.row === to.row && m.to.col === to.col,
    );
    if (!found) return { ok: false, error: '不合法的走法' };

    const captured = this.board.get(to.row, to.col);
    const snapshot = {
      from: { ...from },
      to: { ...to },
      piece: { ...piece },
      captured: captured ? { ...captured } : null,
      prevStatus: this.status,
      prevWinner: this.winner,
      prevWinReason: this.winReason,
      side: piece.side,
    };

    this._unrecordPosition();

    // 执行走子
    this.board.set(to.row, to.col, piece);
    this.board.set(from.row, from.col, null);

    this.history.push(snapshot);
    this.moveNumber += 1;

    const next = OPPONENT[this.turn];
    this.turn = next;

    const repeat = this._recordPosition();

    // 胜负判定
    const inCheck = isInCheck(this.board, next);
    const hasMove = hasAnyLegalMove(this.board, next);

    if (!hasMove) {
      // 无棋可走：将军 => 绝杀，否则 => 困毙，均判负
      this.status = next === SIDE.RED ? GAME_STATUS.BLACK_WIN : GAME_STATUS.RED_WIN;
      this.winner = OPPONENT[next];
      this.winReason = inCheck ? '绝杀' : '困毙';
    } else if (repeat >= 3) {
      this.status = GAME_STATUS.DRAW;
      this.winner = null;
      this.winReason = '三次重复局面';
    }

    return {
      ok: true,
      captured: captured ? { ...captured } : null,
      check: inCheck,
      status: this.status,
      winner: this.winner,
      winReason: this.winReason,
    };
  }

  /**
   * 悔棋：回退一步（或指定步数）
   * @param {number} steps
   * @returns {number} 实际悔棋步数
   */
  undo(steps = 1) {
    let undone = 0;
    for (let i = 0; i < steps; i++) {
      const last = this.history[this.history.length - 1];
      if (!last) break;

      this._unrecordPosition();

      // 还原
      this.board.set(last.from.row, last.from.col, last.piece);
      this.board.set(last.to.row, last.to.col, last.captured);
      this.turn = last.side;
      this.status = last.prevStatus;
      this.winner = last.prevWinner;
      this.winReason = last.prevWinReason;

      this.history.pop();
      this.moveNumber -= 1;
      undone += 1;
    }
    return undone;
  }

  /**
   * 生成走法记谱（中文记谱法，简化版）
   */
  describeMove(from, to, piece, captured) {
    if (!piece) return '';
    return moveNotation(this.board, piece.side, from, to, piece);
  }

  _columnName(side, col) {
    if (side === SIDE.RED) {
      const names = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
      return names[col];
    }
    return String(col + 1);
  }

  _numberName(side, n) {
    if (side === SIDE.RED) {
      const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
      return names[n - 1] || String(n);
    }
    return String(n);
  }

  /** 导出当前局面文本（给 AI 用） */
  toText() {
    const lines = [];
    for (let row = 0; row < 10; row++) {
      const cells = [];
      for (let col = 0; col < 9; col++) {
        const p = this.board.get(row, col);
        if (!p) {
          cells.push('．');
        } else {
          const ch = PIECE_LABEL[p.side][p.type];
          cells.push(ch);
        }
      }
      lines.push(cells.join(''));
    }
    return lines.join('\n');
  }
}
