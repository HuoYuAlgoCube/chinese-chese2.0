/**
 * 应用主控：串联 Game 引擎与 UI，处理三个模式与设置面板
 */
import { Game, GAME_STATUS } from './core/game.js';
import { SIDE, OPPONENT, PIECE_LABEL } from './core/constants.js';
import { settings } from './core/settings.js';
import { BoardRenderer } from './ui/renderer.js';
import { requestAIMove, requestHint, requestComment, buildBoardText, buildHistoryText } from './ai/engine.js';
import {
  PERSONA,
  judgeMoveLine,
  judgeUndo,
  hintPhrase,
  blunderLine,
  personaSays,
  evaluateMoveOutcome,
  commentTargetLabel,
} from './core/persona.js';

class App {
  constructor() {
    this.game = new Game();
    this.mode = settings.get('mode', 'pvp'); // pvp | pve
    this.aiSide = SIDE.BLACK; // 人机模式：AI 执黑
    this.selected = null;
    this.aiThinking = false;
    this.undoCount = 0;
    this.hintCount = 0;
    this.hintMove = null;

    this.$ = (sel) => document.querySelector(sel);
    this.boardEl = this.$('#board');
    this.statusEl = this.$('#status-text');
    this.turnEl = this.$('#turn-indicator');
    this.moveListEl = this.$('#move-list');
    this.aiPanelEl = this.$('#ai-panel');
    this.toastEl = this.$('#toast');

    this.renderer = new BoardRenderer(this.boardEl, settings);
    this.renderer.setKingKeyProvider((side) => this._kingKey(side));

    this._bindUI();
    this._bindSettings();
    this.newGame();

    this._syncTheme();
    settings.onChange(() => {
      this._syncTheme();
      this.renderer.layout();
      this._renderModeVisibility();
    });
  }

  /* -------------------- 初始化 -------------------- */

  _bindUI() {
    this.boardEl.addEventListener('click', (e) => {
      const pos = this.renderer.pixelToPos(e.clientX, e.clientY);
      if (!pos) {
        this._clearSelection();
        return;
      }
      this._handleClick(pos.row, pos.col);
    });

    this.$('#btn-new').addEventListener('click', () => {
      if (this.game.history.length && !confirm('确定要重新开始吗？当前进度将丢失。')) return;
      this.newGame();
    });

    this.$('#btn-undo').addEventListener('click', () => this.undo());

    this.$('#btn-hint').addEventListener('click', () => this.hint());

    this.$('#btn-settings').addEventListener('click', () => this._toggleSettings(true));
    this.$('#btn-close-settings').addEventListener('click', () => this._toggleSettings(false));
    this.$('#settings-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'settings-overlay') this._toggleSettings(false);
    });

    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
  }

  /* -------------------- 模式 -------------------- */

  setMode(mode) {
    if (mode !== 'pvp' && mode !== 'pve') return;
    if (mode !== this.mode && this.game.history.length) {
      if (!confirm('切换模式将重新开始一局，确定吗？')) return;
    }
    this.mode = mode;
    settings.set('mode', mode);
    this.newGame();
  }

  _renderModeVisibility() {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
    });
    // AI 支招按钮仅在双人模式可用
    const hintVisible = this.mode === 'pvp';
    const hintBtn = this.$('#btn-hint');
    hintBtn.style.display = hintVisible ? '' : 'none';
    const hintCount = this.$('#hint-count');
    if (hintCount) hintCount.style.display = hintVisible ? '' : 'none';

    // 悔棋按钮受设置控制
    const undoEnabled = settings.get('undo.enabled', true);
    this.$('#btn-undo').style.display = undoEnabled ? '' : 'none';
    this.$('#undo-count').style.display = undoEnabled ? '' : 'none';

    // AI 对手卡：仅人机模式显示，并标明廖老爷执子方
    const oppCard = this.$('#ai-opponent');
    if (oppCard) oppCard.style.display = this.mode === 'pve' ? '' : 'none';
    const oppSide = this.$('#ai-opp-side');
    if (oppSide) oppSide.textContent = this.aiSide === SIDE.RED ? '红' : '黑';

    this._updateCounters();
  }

  /* -------------------- 对局控制 -------------------- */

  newGame() {
    this.game.reset();
    this.selected = null;
    this.aiThinking = false;
    this.undoCount = 0;
    this.hintCount = 0;
    this.hintMove = null;
    this.renderer.clearArrow();
    this.renderer.clearMoveMarkers();
    this.renderer.showLastMove(null, null);
    // 先计算布局尺寸（cellSize），再渲染棋子，否则棋子尺寸为 0
    this.renderer.layout();
    this.renderer.renderPieces(this.game, this._pieceHandlers());
    this._pushMoveList();
    this._syncStatus();
    this._renderModeVisibility();

    // 人机模式：重置对手卡状态
    if (this.mode === 'pve') {
      this._setAiOppStatus('廖老爷正襟危坐，等你落子。');
    }

    // 新对局：廖老爷问候
    if (settings.get('persona.enabled', true)) {
      const greet = this.mode === 'pve'
        ? `${PERSONA.aiTaunt}（廖老爷执${this.aiSide === SIDE.RED ? '红' : '黑'}）`
        : '双人对战开局，二位请落子，廖老爷为你们评棋。';
      const el = this.$('#persona-comment');
      if (el) el.textContent = greet;
    }

    if (this.mode === 'pve' && this.game.turn === this.aiSide) {
      this._aiMove();
    }
  }

  _pieceHandlers() {
    return {
      onPieceClick: (row, col, el) => this._handleClick(row, col),
    };
  }

  _handleClick(row, col) {
    if (this.game.isOver || this.aiThinking) return;
    if (this.mode === 'pve' && this.game.turn === this.aiSide) return;

    const piece = this.game.board.get(row, col);

    // 已选中棋子：尝试走子
    if (this.selected) {
      const moves = this.game.getMovesForPiece(this.selected.row, this.selected.col);
      const target = moves.find((m) => m.row === row && m.col === col);
      if (target) {
        this._doMove(this.selected, { row, col });
        return;
      }
    }

    // 选择己方棋子
    if (piece && piece.side === this.game.turn) {
      this.selected = { row, col };
      this.renderer.highlightSelection(row, col);
      const moves = this.game.getMovesForPiece(row, col);
      this.renderer.showMoveMarkers(moves);
    } else {
      this._clearSelection();
    }
  }

  _clearSelection() {
    this.selected = null;
    this.renderer.clearSelection();
    this.renderer.clearMoveMarkers();
  }

  async _doMove(from, to) {
    const piece = this.game.board.get(from.row, from.col);
    const result = this.game.move(from, to);
    if (!result.ok) {
      this._toast(result.error, 'error');
      return;
    }

    this._clearSelection();
    this.renderer.clearArrow();
    this.hintMove = null;

    await this.renderer.animateMove(from, to);

    if (result.captured) {
      this.renderer.playCaptureEffect(to.row, to.col);
    }
    this.renderer.renderPieces(this.game, this._pieceHandlers());
    if (settings.get('ui.showLastMove', true)) {
      this.renderer.showLastMove(from, to);
    }

    const lastSnapshot = this.game.history[this.game.history.length - 1];
    this._pushMoveList();

    if (result.check) {
      this.renderer.playCheckEffect(this.game.turn);
      this._toast(`${this._sideName(this.game.turn)}被将军！`, 'warn');
    }

    // 廖老爷评棋（双人对战点评每步；人机模式点评每步，含犀利点评）
    if (settings.get('persona.commentMove', true)) {
      const mover = lastSnapshot ? lastSnapshot.side : this.game.currentSide;
      const outcome = lastSnapshot
        ? evaluateMoveOutcome(this.game, lastSnapshot, mover)
        : { sideGains: 0, sideLoses: 0, movedPieceValue: 0 };
      this._letPersonaJudgeMove({
        piece: lastSnapshot ? lastSnapshot.piece : piece,
        captured: result.captured,
        check: result.check,
        moveNumber: this.game.moveNumber,
        notation: lastSnapshot
          ? this.game.describeMove(lastSnapshot.from, lastSnapshot.to, lastSnapshot.piece, result.captured)
          : '',
        matchOver: this.game.isOver,
        winner: this.game.winner,
        sideGains: outcome.sideGains,
        sideLoses: outcome.sideLoses,
        sideLosesBig: outcome.sideLoses >= 270,
        mover,
      });
    }

    this._syncStatus();

    if (this.game.isOver) {
      this._onGameOver();
      return;
    }

    if (this.mode === 'pve' && this.game.turn === this.aiSide) {
      this._aiMove();
    }
  }

  /**
   * 让「廖老爷」点评一步棋
   * 双人对战：点评每一方的走子
   * 人机对战：廖老爷即 AI 本人，点评玩家的走子（含犀利毒舌），
   *           自己走子时则以自评口吻播报
   * 评语来源由 persona.commentSource 决定：ai=大模型生成（失败降级本地），local=本地句库
   */
  async _letPersonaJudgeMove(ctx) {
    if (!settings.get('persona.enabled', true)) return;

    const isPve = this.mode === 'pve';
    const isAiMove = isPve && ctx.mover === this.aiSide;
    const side = ctx.mover || ctx.side || this.game.currentSide;

    if (isAiMove) {
      // 廖老爷自己走棋：先播报落子，再（可选）自评
      const line = ctx.check
        ? `廖老爷落子了：${ctx.notation}，将军！`
        : `廖老爷落子了：${ctx.notation}。`;
      this._personaSay(`【廖老爷·落子】${line}`, { toastType: 'info' });
      if (settings.get('persona.aiSelfComment', true)) {
        await this._personaComment({ ...ctx, side, isSelf: true });
      }
      return;
    }

    // 玩家 / 双方走棋：按评语范围决定是否点评平淡着法
    const scope = settings.get('persona.commentScope', 'key');
    const isKey = !!(ctx.captured || ctx.check || ctx.matchOver || ctx.sideLosesBig);
    if (isPve && scope === 'key' && !isKey) {
      if ((this.game.moveNumber % 3) !== 0) return;
    }

    await this._personaComment({ ...ctx, side, isSelf: false });
  }

  /**
   * 生成并播报一条带对象前缀的评语。
   * commentSource=ai 时优先请求大模型，失败自动降级本地句库（保留犀利档）。
   */
  async _personaComment(ctx) {
    const source = settings.get('persona.commentSource', 'ai');
    let line = null;

    if (source === 'ai') {
      line = await requestComment(
        {
          ...ctx,
          side: ctx.side,
          boardText: buildBoardText(this.game),
          historyText: buildHistoryText(this.game),
        },
        settings,
      );
    }

    // 本地兜底（未配置 API / 请求失败 / 使用本地句库）
    if (!line) {
      line = judgeMoveLine(ctx, { isSelf: !!ctx.isSelf });
      if (this.mode === 'pve' && ctx.sideLosesBig && !ctx.isSelf) {
        line = { target: line.target, text: blunderLine(ctx), tone: 'sharp' };
      }
    }

    const prefix = ctx.notation ? `${ctx.notation} —— ` : '';
    this._personaSay({ ...line, text: prefix + line.text });
  }

  /**
   * 输出一条「廖老爷」评语（界面卡片 + 提示条）。
   * 支持两种形式：字符串，或 {target, text, tone} 对象（对象会加对象前缀）。
   */
  _personaSay(text, opts = {}) {
    let display = text;
    if (text && typeof text === 'object') {
      const { target, text: body, tone } = text;
      const label = commentTargetLabel(target);
      const toneTag = tone && PERSONA.toneLabels && PERSONA.toneLabels[tone]
        ? `·${PERSONA.toneLabels[tone]}`
        : '';
      const isSelf = target === 'self';
      const head = isSelf ? '【廖老爷·自评】' : `【廖老爷${toneTag}·点评${label}】`;
      display = `${head}${body}`;
    }
    const el = this.$('#persona-comment');
    if (el) {
      el.textContent = display;
      el.classList.add('fresh');
      clearTimeout(this._personaTimer);
      this._personaTimer = setTimeout(() => el.classList.remove('fresh'), 1200);
    }
    const duration = settings.get('persona.duration', 5000);
    this._toast(personaSays(display), opts.toastType || 'persona', duration);
  }

  undo() {
    if (!settings.get('undo.enabled', true)) {
      this._toast('悔棋功能已在设置中关闭', 'error');
      return;
    }
    // 次数限制优先于"无棋可悔"判断：达到上限时给出更准确的原因
    if (this._isUndoLimitReached()) {
      const max = settings.get('undo.maxUndos', 3);
      this._toast(`已达到最大悔棋次数（${max} 次）`, 'error');
      return;
    }
    if (this.game.history.length === 0) {
      this._toast('没有可以悔棋的步骤', 'error');
      return;
    }

    let steps = settings.get('undo.stepsPerClick', 1) || 1;
    // 人机模式：若悔棋后轮到 AI，则多悔一步，保证轮回到玩家
    const before = this.game.turn;
    let undone = this.game.undo(steps);

    if (this.mode === 'pve' && this.game.turn === this.aiSide && this.game.history.length > 0) {
      undone += this.game.undo(1);
    }

    if (undone === 0) {
      this._toast('没有可以悔棋的步骤', 'error');
      return;
    }

    this.undoCount += 1;
    this._clearSelection();
    this.renderer.clearArrow();
    this.hintMove = null;
    this.renderer.renderPieces(this.game, this._pieceHandlers());
    this.renderer.layout();

    const last = this.game.history[this.game.history.length - 1];
    if (last && settings.get('ui.showLastMove', true)) {
      this.renderer.showLastMove(last.from, last.to);
    } else {
      this.renderer.showLastMove(null, null);
    }

    this._pushMoveList();
    this._syncStatus();
    if (settings.get('persona.enabled', true)) {
      const remark = judgeUndo(this.undoCount + undone);
      this._personaSay(`已悔棋 ${undone} 步。${remark}`, { toastType: 'persona' });
    } else {
      this._toast(`已悔棋 ${undone} 步`, 'info');
    }
  }

  /* -------------------- AI -------------------- */

  async _aiMove() {
    if (this.aiThinking || this.game.isOver) return;
    if (!this._ensureAIConfig()) return;

    this.aiThinking = true;
    this._showThinking(true);
    this._setAiOppStatus('廖老爷正在捋胡子，琢磨下一步……');
    this._syncStatus();

    try {
      const move = await requestAIMove(this.game, this.game.turn, settings);
      this._showThinking(false);
      this.aiThinking = false;
      if (this.game.isOver) return;
      this._setAiOppStatus('廖老爷落子了。');
      await this._doMove(move.from, move.to);
      // 廖老爷落子的解说与自评已在 _doMove → _letPersonaJudgeMove 中统一播报
    } catch (e) {
      this.aiThinking = false;
      this._showThinking(false);
      this._syncStatus();
      this._setAiOppStatus('廖老爷一时没想好，稍后再试。');
      this._toast('廖老爷走子失败：' + e.message, 'error');
    }
  }

  /** 更新 AI 对手卡（廖老爷）的即时状态文字 */
  _setAiOppStatus(text) {
    const el = this.$('#ai-opp-status');
    if (el) el.textContent = text;
  }

  async hint() {
    if (this.mode !== 'pvp') {
      this._toast('AI 支招仅在双人对战中可用', 'error');
      return;
    }
    if (!settings.get('hint.enabled', true)) {
      this._toast('AI 支招已在设置中关闭', 'error');
      return;
    }
    if (this.game.isOver) return;
    if (this._isHintLimitReached()) {
      const max = settings.get('hint.maxHints', 3);
      this._toast(`已达到本局最大支招次数（${max} 次）`, 'error');
      return;
    }
    if (!this._ensureAIConfig()) return;

    const hintBtn = this.$('#btn-hint');
    hintBtn.dataset.busy = '1';
    hintBtn.disabled = true;
    hintBtn.textContent = '支招中…';

    try {
      const move = await requestHint(this.game, this.game.turn, settings);
      this.hintMove = move;
      this.hintCount += 1;
      this.renderer.showArrow(move.from, move.to);

      const notation = this._describe(move.from, move.to);
      const reason = move.reason ? `（${move.reason}）` : '';
      if (settings.get('persona.enabled', true) && settings.get('persona.aiVoice', true)) {
        // 以「廖老爷」口吻播报支招
        const op = hintPhrase(this.hintCount + this.game.moveNumber);
        this._personaSay(`${op}走${notation}。${move.reason || '照此走，先手不丢。'}`);
      } else {
        this._toast(`建议：${notation}${reason}`, 'info', 6000);
      }
    } catch (e) {
      this._toast('支招失败：' + e.message, 'error');
    } finally {
      delete hintBtn.dataset.busy;
      hintBtn.textContent = 'AI 支招';
      // 统一由此处刷新按钮禁用状态（含支招次数限制）
      this._updateCounters();
    }
  }

  _ensureAIConfig() {
    const key = settings.get('ai.apiKey', '');
    const base = settings.get('ai.baseUrl', '');
    if (!key || !key.trim() || !base || !base.trim()) {
      this._toast('请先在「设置 → AI 设置」中配置 base-url 与 api-key', 'error', 5000);
      this._toggleSettings(true);
      this._switchSettingsTab('ai');
      return false;
    }
    return true;
  }

  _showThinking(show) {
    let el = this.$('#thinking');
    if (!el) {
      el = document.createElement('div');
      el.id = 'thinking';
      el.className = 'thinking';
      el.innerHTML =
        '<img class="tiny-avatar" src="src/resources/liaolord.gif" alt="廖老爷" />' +
        '<span class="spinner"></span>廖老爷思考中…';
      this.aiPanelEl.appendChild(el);
    }
    el.style.display = show ? 'flex' : 'none';
  }

  /* -------------------- 状态渲染 -------------------- */

  _syncStatus() {
    const sideName = this._sideName(this.game.turn);
    if (this.game.isOver) {
      if (this.game.status === GAME_STATUS.DRAW) {
        this.statusEl.textContent = `和棋（${this.game.winReason}）`;
      } else {
        this.statusEl.textContent = `${this._sideName(this.game.winner)}胜（${this.game.winReason}）`;
      }
    } else {
      this.statusEl.textContent = `轮到 ${sideName} 走子`;
    }
    this.turnEl.textContent = this.game.isOver ? '对局结束' : sideName;
    this.turnEl.className = `turn-indicator ${this.game.turn}`;
    document.querySelector('#turn-dot').className = `dot ${this.game.turn}`;

    const undoBtn = this.$('#btn-undo');
    undoBtn.disabled = this.game.history.length === 0;
    this._updateCounters();
  }

  /** 悔棋次数是否已达上限 */
  _isUndoLimitReached() {
    if (!settings.get('undo.limitEnabled', false)) return false;
    const max = settings.get('undo.maxUndos', 3);
    return this.undoCount >= max;
  }

  /** 支招次数是否已达上限 */
  _isHintLimitReached() {
    if (!settings.get('hint.limitEnabled', false)) return false;
    const max = settings.get('hint.maxHints', 3);
    return this.hintCount >= max;
  }

  /** 刷新悔棋 / 支招的剩余次数显示与按钮禁用状态 */
  _updateCounters() {
    // ---- 悔棋 ----
    const undoEl = this.$('#undo-count');
    const undoBtn = this.$('#btn-undo');
    if (undoEl) {
      if (settings.get('undo.limitEnabled', false)) {
        const max = settings.get('undo.maxUndos', 3);
        const left = Math.max(0, max - this.undoCount);
        undoEl.textContent = `剩余 ${left} 次`;
        undoEl.classList.toggle('depleted', left === 0);
      } else {
        undoEl.textContent = '';
        undoEl.classList.remove('depleted');
      }
    }
    if (undoBtn) {
      undoBtn.disabled = this.game.history.length === 0 || this._isUndoLimitReached();
    }

    // ---- 支招 ----
    const hintEl = this.$('#hint-count');
    const hintBtn = this.$('#btn-hint');
    if (hintEl) {
      if (settings.get('hint.limitEnabled', false)) {
        const max = settings.get('hint.maxHints', 3);
        const left = Math.max(0, max - this.hintCount);
        hintEl.textContent = `剩余 ${left} 次`;
        hintEl.classList.toggle('depleted', left === 0);
      } else {
        hintEl.textContent = '';
        hintEl.classList.remove('depleted');
      }
    }
    if (hintBtn && !hintBtn.dataset.busy) {
      hintBtn.disabled = this._isHintLimitReached();
    }
  }

  _pushMoveList() {
    if (!settings.get('ui.showMoveList', true)) {
      this.moveListEl.parentElement.style.display = 'none';
      return;
    }
    this.moveListEl.parentElement.style.display = '';
    const moves = this.game.history;
    const rows = [];
    for (let i = 0; i < moves.length; i += 2) {
      const red = moves[i];
      const black = moves[i + 1];
      const n = i / 2 + 1;
      const redTxt = red ? this._describe(red.from, red.to, red.piece) : '';
      const blackTxt = black ? this._describe(black.from, black.to, black.piece) : '';
      rows.push(`<div class="move-row"><span class="mn">${n}.</span>
        <span class="mv red">${redTxt}</span>
        <span class="mv black">${blackTxt}</span></div>`);
    }
    // 最新记录
    if (moves.length === 0) {
      rows.push('<div class="move-empty">尚无走子记录</div>');
    }
    this.moveListEl.innerHTML = rows.join('');
    this.moveListEl.scrollTop = this.moveListEl.scrollHeight;
  }

  _describe(from, to, piece) {
    // 棋子应从"起始位置"取：走子前棋子位于 from；
    // 若从 to 取，会拿到空位或对方棋子，导致建议文字与实际走法不符
    const p = piece || this.game.board.get(from.row, from.col);
    if (!p) return '';
    return this.game.describeMove(from, to, p, null);
  }

  _sideName(side) {
    return side === SIDE.RED ? '红方' : '黑方';
  }

  _kingKey(side) {
    const k = this.game.board.findKing(side);
    return k ? `${k.row},${k.col}` : null;
  }

  _onGameOver() {
    let msg = '';
    let personaMsg = '';
    if (this.game.status === GAME_STATUS.DRAW) {
      msg = `和棋：${this.game.winReason}`;
      personaMsg = '和局收场，二位棋力相当，廖老爷看得很过瘾。';
    } else {
      msg = `${this._sideName(this.game.winner)}胜！(${this.game.winReason})`;
      personaMsg = `${this._sideName(this.game.winner)}以${this.game.winReason}取胜，廖老爷服气！`;
    }
    this._toast(msg, 'info', 8000);
    if (settings.get('persona.enabled', true)) {
      const el = this.$('#persona-comment');
      if (el) el.textContent = `${personaMsg}${PERSONA.signature}`;
    }
    this._showResultModal(msg);
  }

  _showResultModal(msg) {
    const overlay = this.$('#result-overlay');
    this.$('#result-text').textContent = msg;
    overlay.classList.add('show');
    const close = () => overlay.classList.remove('show');
    this.$('#btn-result-close').onclick = close;
    this.$('#btn-result-new').onclick = () => {
      close();
      this.newGame();
    };
  }

  /* -------------------- 设置面板 -------------------- */

  _bindSettings() {
    const s = settings;

    // ---- AI ----
    this._bindInput('#set-ai-base', () => s.get('ai.baseUrl'), (v) => s.set('ai.baseUrl', v));
    this._bindInput('#set-ai-key', () => s.get('ai.apiKey'), (v) => s.set('ai.apiKey', v));
    this._bindInput('#set-ai-model', () => s.get('ai.model'), (v) => s.set('ai.model', v));
    this._bindInput('#set-ai-temp', () => s.get('ai.temperature'), (v) => s.set('ai.temperature', Number(v)));
    this._bindInput('#set-ai-timeout', () => s.get('ai.timeout'), (v) => s.set('ai.timeout', Number(v)));
    this._bindInput('#set-ai-depth', () => s.get('ai.searchDepth'), (v) => s.set('ai.searchDepth', Math.max(1, Math.min(4, Number(v) || 2))));

    this.$('#btn-ai-example').addEventListener('click', () => {
      this.$('#set-ai-base').value = 'https://open.bigmodel.cn/api/paas/v4';
      this.$('#set-ai-model').value = 'glm-4-flash';
      s.set('ai.baseUrl', 'https://open.bigmodel.cn/api/paas/v4');
      s.set('ai.model', 'glm-4-flash');
      this._toast('已填入智谱示例配置，请补充你的 api-key', 'info');
    });

    this.$('#btn-ai-test').addEventListener('click', async () => {
      const btn = this.$('#btn-ai-test');
      btn.disabled = true;
      btn.textContent = '测试中…';
      try {
        const { createAIClient } = await import('./ai/client.js');
        const client = createAIClient(s);
        const reply = await client.test();
        this._toast('连接成功，模型回复：' + reply, 'info');
      } catch (e) {
        this._toast('连接失败：' + e.message, 'error', 8000);
      } finally {
        btn.disabled = false;
        btn.textContent = '测试连接';
      }
    });

    this.$('#btn-ai-toggle-key').addEventListener('click', () => {
      const input = this.$('#set-ai-key');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // ---- 悔棋 ----
    this._bindCheckbox('#set-undo-enabled', 'undo.enabled');
    this._bindInput('#set-undo-steps', () => s.get('undo.stepsPerClick'), (v) => s.set('undo.stepsPerClick', Number(v)));
    this._bindCheckbox('#set-undo-limit', 'undo.limitEnabled');
    this._bindInput('#set-undo-max', () => s.get('undo.maxUndos'), (v) => s.set('undo.maxUndos', Number(v)));

    // ---- AI 支招 ----
    this._bindCheckbox('#set-hint-enabled', 'hint.enabled');
    this._bindCheckbox('#set-hint-arrow', 'hint.showArrow');
    this._bindCheckbox('#set-hint-limit', 'hint.limitEnabled');
    this._bindInput('#set-hint-max', () => s.get('hint.maxHints'),
      (v) => s.set('hint.maxHints', Math.max(1, Math.min(99, Number(v) || 1))));

    // ---- 界面 ----
    this._bindCheckbox('#set-ui-coord', 'ui.showCoordinates');
    this._bindCheckbox('#set-ui-last', 'ui.showLastMove');
    this._bindCheckbox('#set-ui-movelist', 'ui.showMoveList');
    this._bindCheckbox('#set-ui-anim', 'ui.animationEnabled');
    this._bindCheckbox('#set-ui-effect', 'ui.effectEnabled');

    // ---- 廖老爷 ----
    this._bindCheckbox('#set-persona-enabled', 'persona.enabled');
    this._bindCheckbox('#set-persona-show-avatar', 'persona.showAvatar');
    this._bindCheckbox('#set-persona-ai-voice', 'persona.aiVoice');
    this._bindCheckbox('#set-persona-comment-move', 'persona.commentMove');
    this._bindCheckbox('#set-persona-ai-self', 'persona.aiSelfComment');
    this._bindSelect('#set-persona-source', 'persona.commentSource');
    this._bindSelect('#set-persona-scope', 'persona.commentScope');
    this._bindInput('#set-persona-duration', () => s.get('persona.duration'),
      (v) => s.set('persona.duration', Math.max(1500, Math.min(15000, Number(v) || 5000))));
    this._bindSelect('#set-ui-theme', 'ui.theme');
    this._bindSelect('#set-ui-piecemode', 'ui.pieceStyle');

    this.$('#btn-settings-reset').addEventListener('click', () => {
      if (!confirm('确定恢复默认设置吗？')) return;
      s.reset();
      this._loadSettingsToForm();
      this._toast('已恢复默认设置', 'info');
    });

    // 设置页签
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this._switchSettingsTab(btn.dataset.tab));
    });

    s.onChange(() => {
      this._applyUiSettings();
      this._pushMoveList();
      this._updateCounters();
    });

    this._loadSettingsToForm();
    this._applyUiSettings();
  }

  _bindInput(sel, getter, setter) {
    const el = this.$(sel);
    if (!el) return;
    el.addEventListener('change', () => {
      let v = el.value;
      if (el.type === 'number') v = Number(v);
      setter(v);
    });
    el._getter = getter;
  }

  _bindCheckbox(sel, path) {
    const el = this.$(sel);
    if (!el) return;
    el.checked = !!settings.get(path);
    el.addEventListener('change', () => settings.set(path, el.checked));
  }

  _bindSelect(sel, path) {
    const el = this.$(sel);
    if (!el) return;
    el.value = settings.get(path);
    el.addEventListener('change', () => settings.set(path, el.value));
  }

  _loadSettingsToForm() {
    const set = (sel, val) => {
      const el = this.$(sel);
      if (el) el.value = val ?? '';
    };
    set('#set-ai-base', settings.get('ai.baseUrl'));
    set('#set-ai-key', settings.get('ai.apiKey'));
    set('#set-ai-model', settings.get('ai.model'));
    set('#set-ai-temp', settings.get('ai.temperature'));
    set('#set-ai-timeout', settings.get('ai.timeout'));
    set('#set-ai-depth', settings.get('ai.searchDepth'));

    set('#set-undo-steps', settings.get('undo.stepsPerClick'));
    set('#set-undo-max', settings.get('undo.maxUndos'));

    const chk = (sel, path) => {
      const el = this.$(sel);
      if (el) el.checked = !!settings.get(path);
    };
    chk('#set-undo-enabled', 'undo.enabled');
    chk('#set-undo-limit', 'undo.limitEnabled');
    chk('#set-hint-enabled', 'hint.enabled');
    chk('#set-hint-arrow', 'hint.showArrow');
    chk('#set-hint-limit', 'hint.limitEnabled');
    set('#set-hint-max', settings.get('hint.maxHints'));
    chk('#set-ui-coord', 'ui.showCoordinates');
    chk('#set-ui-last', 'ui.showLastMove');
    chk('#set-ui-movelist', 'ui.showMoveList');
    chk('#set-ui-anim', 'ui.animationEnabled');
    chk('#set-ui-effect', 'ui.effectEnabled');
    chk('#set-persona-enabled', 'persona.enabled');
    chk('#set-persona-show-avatar', 'persona.showAvatar');
    chk('#set-persona-ai-voice', 'persona.aiVoice');
    chk('#set-persona-comment-move', 'persona.commentMove');
    chk('#set-persona-ai-self', 'persona.aiSelfComment');
    set('#set-persona-duration', settings.get('persona.duration'));

    const st = (sel, path) => {
      const el = this.$(sel);
      if (el) el.value = settings.get(path);
    };
    st('#set-ui-theme', 'ui.theme');
    st('#set-ui-piecemode', 'ui.pieceStyle');
    st('#set-persona-source', 'persona.commentSource');
    st('#set-persona-scope', 'persona.commentScope');
  }

  _applyUiSettings() {
    document.body.dataset.theme = settings.get('ui.theme', 'wood');
    document.body.dataset.piece = settings.get('ui.pieceStyle', 'classic');
    document.body.classList.toggle('hide-coords', !settings.get('ui.showCoordinates', true));
    const ml = this.moveListEl.parentElement;
    if (ml) ml.style.display = settings.get('ui.showMoveList', true) ? '' : 'none';

    // 「廖老爷」形象显隐与评语开关
    const showAvatar = settings.get('persona.showAvatar', true);
    document.body.classList.toggle('hide-persona-avatar', !showAvatar);
    const personaOn = settings.get('persona.enabled', true);
    document.querySelectorAll('.persona-card, .persona-comment-panel').forEach((n) => {
      n.style.display = personaOn ? '' : 'none';
    });
  }

  _syncTheme() {
    document.body.dataset.theme = settings.get('ui.theme', 'wood');
  }

  _toggleSettings(show) {
    this.$('#settings-overlay').classList.toggle('show', show);
  }

  _switchSettingsTab(tab) {
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('[data-tab-panel]').forEach((p) => {
      p.style.display = p.dataset.tabPanel === tab ? '' : 'none';
    });
  }

  /* -------------------- 提示 -------------------- */

  _toast(msg, type = 'info', duration = 3000) {
    const el = this.toastEl;
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.className = 'toast';
    }, duration);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
