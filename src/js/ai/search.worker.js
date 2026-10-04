/**
 * 本地搜索引擎 Web Worker
 *
 * 目的：Alpha-Beta 搜索是同步的 CPU 密集计算，若在主线程运行，
 * 人机对战中玩家每落一子都会冻住界面数秒（深度 2 约 1.3s，深度 4 可达 1 分钟）。
 * 将 `scoreBoardMoves` 放到 Worker 线程执行，主线程保持流畅。
 *
 * 入参：{ grid, side, depth, id }
 *   - grid : Board 的二维数组（结构化克隆）
 *   - side : 行棋方
 *   - depth: 搜索深度
 *   - id   : 请求标识，原样回传，用于配对请求/响应
 * 出参：{ id, scores: Array<[key, score]> }  或  { id, error }
 */
import { Board } from '../core/board.js';
import { scoreBoardMoves } from './search.js';

self.onmessage = (e) => {
  const { grid, side, depth, id } = e.data || {};
  try {
    const board = new Board(grid);
    const scores = scoreBoardMoves(board, side, depth);
    self.postMessage({ id, scores: Array.from(scores.entries()) });
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
