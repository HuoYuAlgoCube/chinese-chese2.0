/**
 * 棋盘渲染器（DOM 实现）
 * 负责：绘制棋盘网格、棋子、高亮、上一步标记、特效层、箭头
 */
import { COLS, ROWS, SIDE, PIECE_LABEL } from '../core/constants.js';

export class BoardRenderer {
  /**
   * @param {HTMLElement} root 棋盘容器
   * @param {object} settings
   */
  constructor(root, settings) {
    this.root = root;
    // 用于测量可用空间的稳定容器（.board-area），避免被棋盘自身尺寸撑大
    this.areaEl = root.closest('.board-area') || root.parentElement || root;
    this.settings = settings;
    this.cellSize = 0;
    this.padding = 0;

    this.root.classList.add('board-root');
    this.root.innerHTML = `
      <div class="board-surface">
        <canvas class="board-canvas"></canvas>
        <div class="board-pieces"></div>
        <div class="board-markers"></div>
        <div class="board-effects"></div>
        <svg class="board-arrows" viewBox="0 0 1 1" preserveAspectRatio="none"></svg>
      </div>
    `;
    this.surface = this.root.querySelector('.board-surface');
    this.canvas = this.root.querySelector('.board-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.piecesLayer = this.root.querySelector('.board-pieces');
    this.markersLayer = this.root.querySelector('.board-markers');
    this.effectsLayer = this.root.querySelector('.board-effects');
    this.arrowsLayer = this.root.querySelector('.board-arrows');

    this.pieceEls = new Map(); // "r,c" -> element
    this._lastLayout = { w: 0, h: 0, cell: 0 };
    this._resizeRaf = null;

    window.addEventListener('resize', () => this._scheduleLayout());
    window.addEventListener('orientationchange', () => this._scheduleLayout());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._scheduleLayout());
    }
  }

  /** 公开：请求下一帧重新计算布局（DOM 显隐变化后调用） */
  scheduleLayout() {
    this._scheduleLayout();
  }

  /** 将 layout 合并到下一帧，避免高频重排 */
  _scheduleLayout() {
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = null;
      this.layout();
    });
  }
  /**
   * 计算布局（响应式：以 min(宽, 高*比例) 为准）
   */
  layout() {
    // 用「不受棋盘影响」的祖先容器测量可用空间，避免尺寸反馈放大
    const measureEl = this.areaEl || this.root;
    const parentRect = measureEl.getBoundingClientRect();
    const gap = 4; // 每格与边界预留
    // 棋盘宽 8 格间距，高 9 格间距
    const availW = parentRect.width - gap * 2;
    const availH = parentRect.height - gap * 2;
    // 棋盘 surface 的完整占位是 cell*COLS 宽、cell*ROWS 高
    // （8 个格间距 + 左右各半格外边距 = 9 格；高度同理 9 格）
    const cellW = availW / COLS;
    const cellH = availH / ROWS;
    const cell = Math.max(20, Math.min(cellW, cellH));

    // 若可用空间无效（容器尚未布局/隐藏），跳过，避免把尺寸算成 0 或异常值
    if (!isFinite(cell) || availW <= 0 || availH <= 0) return;

    const boardW = cell * (COLS - 1);
    const boardH = cell * (ROWS - 1);
    this.cellSize = cell;
    // 让棋子中心所在的坐标系包含半个格子边距
    this.padding = cell * 0.5;

    const surfaceW = Math.round(boardW + cell);
    const surfaceH = Math.round(boardH + cell);

    this.surface.style.width = `${surfaceW}px`;
    this.surface.style.height = `${surfaceH}px`;

    this.canvas.width = surfaceW * window.devicePixelRatio;
    this.canvas.height = surfaceH * window.devicePixelRatio;
    this.canvas.style.width = `${surfaceW}px`;
    this.canvas.style.height = `${surfaceH}px`;
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    this._drawBoard();
    this._layoutPieces();
  }

  /** 坐标 -> 像素 */
  posToPixel(row, col) {
    return {
      x: this.padding + col * this.cellSize,
      y: this.padding + row * this.cellSize,
    };
  }

  /** 像素 -> 坐标 */
  pixelToPos(clientX, clientY) {
    const rect = this.surface.getBoundingClientRect();
    const x = clientX - rect.left - this.padding;
    const y = clientY - rect.top - this.padding;
    const col = Math.round(x / this.cellSize);
    const row = Math.round(y / this.cellSize);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    // 距离过远视为无效
    const dx = x - col * this.cellSize;
    const dy = y - row * this.cellSize;
    if (Math.hypot(dx, dy) > this.cellSize * 0.55) return null;
    return { row, col };
  }

  _drawBoard() {
    const ctx = this.ctx;
    const cell = this.cellSize;
    const pad = this.padding;
    const w = this.surface.clientWidth;
    const h = this.surface.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // 背景木纹
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, getComputedStyle(this.root).getPropertyValue('--board-bg-1') || '#f0d9a7');
    grad.addColorStop(1, getComputedStyle(this.root).getPropertyValue('--board-bg-2') || '#e3be7e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = getComputedStyle(this.root).getPropertyValue('--board-line') || '#5a3b18';
    ctx.lineWidth = Math.max(1, cell * 0.02);

    const x0 = pad;
    const y0 = pad;
    const x1 = pad + cell * (COLS - 1);
    const y1 = pad + cell * (ROWS - 1);

    // 横线
    for (let r = 0; r < ROWS; r++) {
      const y = y0 + r * cell;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    // 竖线（中间河界断开：第 1..7 列在 row 4 和 row 5 之间断开）
    for (let c = 0; c < COLS; c++) {
      const x = x0 + c * cell;
      if (c === 0 || c === COLS - 1) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 + 4 * cell);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y0 + 5 * cell);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
    }

    // 九宫斜线
    const drawDiag = (r1, c1, r2, c2) => {
      ctx.beginPath();
      ctx.moveTo(x0 + c1 * cell, y0 + r1 * cell);
      ctx.lineTo(x0 + c2 * cell, y0 + r2 * cell);
      ctx.stroke();
    };
    drawDiag(0, 3, 2, 5);
    drawDiag(0, 5, 2, 3);
    drawDiag(7, 3, 9, 5);
    drawDiag(7, 5, 9, 3);

    // 外边框加粗
    ctx.lineWidth = Math.max(2, cell * 0.035);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // 河界文字
    ctx.fillStyle = getComputedStyle(this.root).getPropertyValue('--board-line') || '#5a3b18';
    ctx.font = `${cell * 0.5}px "Kaiti SC", "STKaiti", "KaiTi", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = y0 + 4.5 * cell;
    ctx.fillText('楚 河', x0 + cell * 1.7, riverY);
    ctx.fillText('漢 界', x0 + cell * 6.3, riverY);

    // 兵位炮位标记点
    this._drawStarMarks(ctx, cell, pad, x0, y0);
  }

  _drawStarMarks(ctx, cell, pad, x0, y0) {
    const starPoints = [
      [2, 1], [2, 7],
      [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
      [6, 0], [6, 2], [6, 4], [6, 6], [6, 8],
      [7, 1], [7, 7],
    ];
    const len = cell * 0.12;
    const gap = cell * 0.08;
    ctx.strokeStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(1, cell * 0.018);
    for (const [r, c] of starPoints) {
      const x = x0 + c * cell;
      const y = y0 + r * cell;
      const dirs = [];
      if (c > 0) dirs.push([-1, -1], [-1, 1]);
      if (c < COLS - 1) dirs.push([1, -1], [1, 1]);
      for (const [sx, sy] of dirs) {
        ctx.beginPath();
        ctx.moveTo(x + sx * gap, y + sy * gap + sy * len);
        ctx.lineTo(x + sx * gap, y + sy * gap);
        ctx.lineTo(x + sx * gap + sx * len, y + sy * gap);
        ctx.stroke();
      }
    }
  }

  /** 渲染整盘棋子 */
  renderPieces(game, handlers = {}) {
    const board = game.board;
    const seen = new Set();

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const p = board.get(row, col);
        const key = `${row},${col}`;
        if (p) {
          seen.add(key);
          let el = this.pieceEls.get(key);
          if (!el) {
            el = this._createPieceEl(p, row, col, handlers);
            this.pieceEls.set(key, el);
            this.piecesLayer.appendChild(el);
          } else {
            this._updatePieceEl(el, p, row, col);
          }
        }
      }
    }

    // 移除不存在棋子的元素
    for (const [key, el] of [...this.pieceEls.entries()]) {
      if (!seen.has(key)) {
        el.remove();
        this.pieceEls.delete(key);
      }
    }
  }

  _createPieceEl(piece, row, col, handlers) {
    const el = document.createElement('div');
    el.className = `piece piece-${piece.side}`;
    el.dataset.side = piece.side;
    el.innerHTML = `<span class="piece-inner">${PIECE_LABEL[piece.side][piece.type]}</span>`;
    el.style.width = `${this.cellSize * 0.88}px`;
    el.style.height = `${this.cellSize * 0.88}px`;
    el.style.fontSize = `${this.cellSize * 0.52}px`;

    if (handlers.onPieceClick) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onPieceClick(row, col, el);
      });
    }
    this._position(el, row, col);
    return el;
  }

  _updatePieceEl(el, piece, row, col) {
    // 关键：棋子元素按“位置”复用，吃子后该位置可能换成另一方的棋子，
    // 因此必须同步更新阵营 class 与 dataset，否则会出现“红兵吃黑卒后变成黑兵”的串色问题
    const cls = `piece piece-${piece.side}`;
    if (el.className !== cls) el.className = cls;
    if (el.dataset.side !== piece.side) el.dataset.side = piece.side;
    el.innerHTML = `<span class="piece-inner">${PIECE_LABEL[piece.side][piece.type]}</span>`;
    el.style.width = `${this.cellSize * 0.88}px`;
    el.style.height = `${this.cellSize * 0.88}px`;
    el.style.fontSize = `${this.cellSize * 0.52}px`;
    this._position(el, row, col);
  }

  _position(el, row, col) {
    const { x, y } = this.posToPixel(row, col);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  _layoutPieces() {
    for (const [key, el] of this.pieceEls.entries()) {
      const [row, col] = key.split(',').map(Number);
      // 同步尺寸（窗口缩放后需重新计算）
      el.style.width = `${this.cellSize * 0.88}px`;
      el.style.height = `${this.cellSize * 0.88}px`;
      el.style.fontSize = `${this.cellSize * 0.52}px`;
      this._position(el, row, col);
    }
  }
  /** 高亮选中 */
  highlightSelection(row, col) {
    this.clearSelection();
    const el = this.pieceEls.get(`${row},${col}`);
    if (el) el.classList.add('selected');
  }

  clearSelection() {
    for (const el of this.pieceEls.values()) el.classList.remove('selected');
  }

  /** 显示可走位置 */
  showMoveMarkers(moves) {
    this.markersLayer.innerHTML = '';
    for (const m of moves) {
      const dot = document.createElement('div');
      dot.className = 'move-marker';
      const { x, y } = this.posToPixel(m.row, m.col);
      const size = this.cellSize * 0.32;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.left = `${x - size / 2}px`;
      dot.style.top = `${y - size / 2}px`;
      this.markersLayer.appendChild(dot);
    }
  }

  clearMoveMarkers() {
    this.markersLayer.innerHTML = '';
  }

  /** 高亮上一步 */
  showLastMove(from, to) {
    this.markersLayer.querySelectorAll('.last-move').forEach((n) => n.remove());
    if (!from || !to) return;
    for (const p of [from, to]) {
      const box = document.createElement('div');
      box.className = 'last-move';
      const { x, y } = this.posToPixel(p.row, p.col);
      const size = this.cellSize * 0.92;
      box.style.width = `${size}px`;
      box.style.height = `${size}px`;
      box.style.left = `${x - size / 2}px`;
      box.style.top = `${y - size / 2}px`;
      this.markersLayer.appendChild(box);
    }
  }

  /** 棋盘尺寸变化后重新渲染整盘棋子 */
  showArrow(from, to, color = '#e74c3c') {
    if (!this.settings.get('hint.showArrow', true)) return;
    const a = this.posToPixel(from.row, from.col);
    const b = this.posToPixel(to.row, to.col);
    const w = this.surface.clientWidth;
    const h = this.surface.clientHeight;
    this.arrowsLayer.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.arrowsLayer.innerHTML = `
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="4" refY="3"
                orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill="${color}" />
        </marker>
      </defs>
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
            stroke="${color}" stroke-width="${Math.max(3, this.cellSize * 0.1)}"
            stroke-linecap="round" marker-end="url(#arrowhead)" opacity="0.85" />
      <circle cx="${a.x}" cy="${a.y}" r="${this.cellSize * 0.12}" fill="${color}" opacity="0.85" />
    `;
    this.arrowsLayer.style.display = 'block';
  }

  clearArrow() {
    this.arrowsLayer.innerHTML = '';
    this.arrowsLayer.style.display = 'none';
  }

  /** 走棋动画：移动某个棋子元素 */
  animateMove(from, to, duration = 220) {
    if (!this.settings.get('ui.animationEnabled', true)) return Promise.resolve();
    return new Promise((resolve) => {
      const el = this.pieceEls.get(`${from.row},${from.col}`);
      if (!el) return resolve();
      const a = this.posToPixel(from.row, from.col);
      const b = this.posToPixel(to.row, to.col);
      const start = performance.now();
      const anim = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const x = a.x + (b.x - a.x) * e;
        const y = a.y + (b.y - a.y) * e;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        if (t < 1) requestAnimationFrame(anim);
        else resolve();
      };
      requestAnimationFrame(anim);
    });
  }

  /** 吃子特效 */
  playCaptureEffect(row, col) {
    if (!this.settings.get('ui.effectEnabled', true)) return;
    const { x, y } = this.posToPixel(row, col);
    const size = this.cellSize;
    const burst = document.createElement('div');
    burst.className = 'capture-burst';
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    burst.style.width = `${size}px`;
    burst.style.height = `${size}px`;
    this.effectsLayer.appendChild(burst);
    setTimeout(() => burst.remove(), 600);
  }

  /** 将军特效 */
  playCheckEffect(side) {
    if (!this.settings.get('ui.effectEnabled', true)) return;
    const key = this._kingKeyFromBoard(side);
    if (!key) return;
    const el = this.pieceEls.get(key);
    if (el) {
      el.classList.add('in-check');
      setTimeout(() => el.classList.remove('in-check'), 1200);
    }
  }

  setKingKeyProvider(fn) {
    this._kingKeyFromBoard = fn;
  }
}
