/**
 * 本地搜索调度器
 *
 * 优先在 Web Worker 中执行 CPU 密集的 Alpha-Beta 搜索，避免阻塞主线程
 * （人机对战中玩家每落一子都会触发一次搜索，同步执行会冻住界面数秒）。
 *
 * 若运行环境不支持 Worker（例如以 file:// 直接打开、或历史浏览器），
 * 自动回退到主线程同步搜索，保证功能始终可用。
 */
import { scoreBoardMoves } from './search.js';

let worker = null;
let workerBroken = false;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./search.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, scores, error } = e.data || {};
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error) entry.reject(new Error(error));
      else entry.resolve(new Map(scores));
    };
    worker.onerror = (e) => {
      // Worker 加载/运行失败：销毁并标记为不可用，回调全部转为同步执行
      workerBroken = true;
      try { worker && worker.terminate(); } catch { /* ignore */ }
      worker = null;
      for (const [, entry] of pending) entry.reject(new Error(e.message || 'worker error'));
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    worker = null;
    return null;
  }
}

/**
 * 对某局面的全部合法走法打分（异步）。
 * @param {{ grid: Array<Array> }} board 棋盘（Board 实例，可被结构化克隆）
 * @param {string} side 行棋方
 * @param {number} depth 搜索深度
 * @returns {Promise<Map<string, number>>}
 */
export function scoreBoardMovesAsync(board, side, depth) {
  const w = getWorker();
  if (!w) {
    // 回退：主线程同步搜索（会短暂阻塞，但保证可用）
    return Promise.resolve(scoreBoardMoves(board, side, depth));
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ grid: board.grid, side, depth, id });
  });
}
