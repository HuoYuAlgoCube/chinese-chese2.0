/**
 * 设置管理：localStorage 持久化
 */

const STORAGE_KEY = 'cc2.settings.v1';

/** 智谱 AI 示例配置 */
export const ZHIPU_EXAMPLE = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4-flash',
};

export const DEFAULT_SETTINGS = {
  ai: {
    baseUrl: ZHIPU_EXAMPLE.baseUrl,
    apiKey: ZHIPU_EXAMPLE.apiKey,
    model: ZHIPU_EXAMPLE.model,
    temperature: 0.3,
    timeout: 30000,
    searchDepth: 2,          // 本地搜索深度（越大越强但越慢）
  },
  undo: {
    enabled: true,           // 是否允许悔棋
    stepsPerClick: 1,        // 每次悔棋回退步数
    limitEnabled: false,     // 是否限制悔棋次数
    maxUndos: 3,             // 最多悔棋次数
  },
  hint: {
    enabled: true,           // 是否启用 AI 支招
    autoHint: false,         // 轮到某方时自动支招
    showArrow: true,         // 是否显示箭头
    limitEnabled: false,     // 是否限制支招次数
    maxHints: 3,             // 最多支招次数
  },
  ui: {
    showCoordinates: true,   // 显示坐标
    showLastMove: true,      // 高亮上一步
    showMoveList: true,      // 显示走子列表
    soundEnabled: false,     // 音效
    animationEnabled: true,  // 走棋动画
    effectEnabled: true,     // 吃子/走棋特效
    pieceStyle: 'classic',   // 棋子样式
    theme: 'wood',           // 棋盘主题
  },
  persona: {
    enabled: true,           // 启用「廖老爷」评语
    showAvatar: true,        // 显示「廖老爷」形象
    aiVoice: true,           // AI 支招以「廖老爷」口吻播报
    commentMove: true,       // 双人对战中点评每步走子
    duration: 5000,          // 评语展示时长（ms）
    // 评语来源：ai = 完全由大模型生成（失败降级本地）；local = 仅用本地句库
    commentSource: 'ai',
    // 评语范围：key = 仅关键着法（吃子/将军/失误）调用 AI；all = 每步都评
    commentScope: 'key',
    aiSelfComment: true,     // 人机模式：廖老爷走子后自评
    aiCommentTimeout: 8000,  // AI 评语请求超时（ms）
  },
  mode: 'pvp',               // 当前模式：pvp | pve
};

function deepMerge(target, source) {
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const key of Object.keys(source || {})) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      out[key] = deepMerge(target[key] || {}, sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

class SettingsManager {
  constructor() {
    this.data = this._load();
    this._listeners = new Set();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepMerge(DEFAULT_SETTINGS, {});
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_SETTINGS, parsed);
    } catch (e) {
      console.warn('读取设置失败，使用默认值', e);
      return deepMerge(DEFAULT_SETTINGS, {});
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('保存设置失败', e);
    }
  }

  get(path, fallback) {
    const parts = path.split('.');
    let cur = this.data;
    for (const p of parts) {
      if (cur == null) return fallback;
      cur = cur[p];
    }
    return cur === undefined ? fallback : cur;
  }

  set(path, value) {
    const parts = path.split('.');
    let cur = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
    this.save();
    this._emit();
  }

  /** 批量更新 */
  update(patch) {
    this.data = deepMerge(this.data, patch);
    this.save();
    this._emit();
  }

  reset() {
    this.data = deepMerge(DEFAULT_SETTINGS, {});
    this.save();
    this._emit();
  }

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _emit() {
    for (const cb of this._listeners) {
      try {
        cb(this.data);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

export const settings = new SettingsManager();
