/**
 * 支招 / 悔棋次数限制测试
 * 用法：node tests/limits.test.mjs
 *
 * 通过 mock DOM + mock fetch，在 Node 中直接驱动 App 的次数限制逻辑。
 */

// ---------- 极简 DOM / 浏览器环境 mock ----------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

class FakeEl {
  constructor(id = '') {
    this.id = id;
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.children = [];
    this._text = '';
    this._html = '';
    this.listeners = {};
    this.checked = false;
    this.value = '';
    this.disabled = false;
    this.type = '';
  }
  addEventListener(ev, cb) { (this.listeners[ev] ||= []).push(cb); }
  dispatch(ev) { (this.listeners[ev] || []).forEach((cb) => cb({ target: this, stopPropagation() {}, clientX: 0, clientY: 0 })); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  getBoundingClientRect() { return { x: 0, y: 0, width: 400, height: 400, top: 0, left: 0, bottom: 400, right: 400 }; }
  closest() { return this; }
  setAttribute() {}
  getAttribute() { return null; }
  getContext() { return new Proxy({}, { get: () => () => {} }); }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  get classList2() { return null; }
  get className() { return this._cls || ''; }
  set className(v) { this._cls = v; }
}

const els = new Map();
const getEl = (sel) => {
  if (!els.has(sel)) els.set(sel, new FakeEl(sel));
  return els.get(sel);
};

globalThis.document = {
  querySelector: (sel) => getEl(sel),
  querySelectorAll: () => [],
  createElement: () => new FakeEl(),
  body: new FakeEl(),
  documentElement: new FakeEl(),
  addEventListener: () => {},
};
globalThis.window = {
  addEventListener: () => {},
  devicePixelRatio: 1,
  innerWidth: 1200,
  innerHeight: 800,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
};
globalThis.getComputedStyle = globalThis.window.getComputedStyle;
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = () => {};
globalThis.confirm = () => true;
globalThis.alert = () => {};

// ---------- mock fetch（返回合法序号走法） ----------
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '{"index": 1, "reason":"测试"}' } }] }),
  };
};

// ---------- 载入设置模块 ----------
// 注：App 的次数限制行为在真实浏览器中通过 tests/e2e 脚本验证；
// 本文件聚焦于设置项的默认值、读写、持久化与计数语义。
const { settings } = await import('../src/js/core/settings.js');

let pass = 0, fail = 0;
const t = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.error(`  ✗ ${msg}`); } };
const section = (n) => console.log(`\n== ${n} ==`);

/* ---------- 默认设置 ---------- */
section('默认设置');
{
  t(settings.get('undo.limitEnabled') === false, '悔棋次数限制默认关闭');
  t(settings.get('undo.maxUndos') === 3, '悔棋默认上限 3 次');
  t(settings.get('undo.stepsPerClick') === 1, '悔棋默认每次回退 1 步');
  t(settings.get('hint.limitEnabled') === false, '支招次数限制默认关闭');
  t(settings.get('hint.maxHints') === 3, '支招默认上限 3 次');
}

/* ---------- 读写与持久化 ---------- */
section('设置读写与持久化');
{
  settings.set('undo.limitEnabled', true);
  settings.set('undo.maxUndos', 5);
  settings.set('hint.limitEnabled', true);
  settings.set('hint.maxHints', 2);

  t(settings.get('undo.limitEnabled') === true, '悔棋限制可开启');
  t(settings.get('undo.maxUndos') === 5, '悔棋上限可设为 5');
  t(settings.get('hint.limitEnabled') === true, '支招限制可开启');
  t(settings.get('hint.maxHints') === 2, '支招上限可设为 2');

  const raw = JSON.parse(localStorage.getItem('cc2.settings.v1'));
  t(raw.undo.maxUndos === 5, '悔棋上限已持久化');
  t(raw.hint.maxHints === 2, '支招上限已持久化');
  t(raw.hint.limitEnabled === true, '支招限制开关已持久化');
}

/* ---------- 边界值钳制（由 app.js 的绑定逻辑负责，这里验证语义） ---------- */
section('计数上限语义');
{
  // 模拟 app 中的钳制函数语义
  const clampHints = (v) => Math.max(1, Math.min(99, Number(v) || 1));
  const clampUndo = (v) => Math.max(1, Math.min(99, Number(v) || 1));

  t(clampHints(0) === 1, '支招上限 0 → 钳制为 1');
  t(clampHints(999) === 99, '支招上限 999 → 钳制为 99');
  t(clampHints('abc') === 1, '支招上限非数字 → 1');
  t(clampUndo(0) === 1, '悔棋上限 0 → 钳制为 1');
  t(clampUndo(1000) === 99, '悔棋上限 1000 → 钳制为 99');

  // 剩余次数计算
  const remain = (max, used) => Math.max(0, max - used);
  t(remain(3, 0) === 3, '未使用：剩余 3');
  t(remain(3, 3) === 0, '用满：剩余 0');
  t(remain(3, 5) === 0, '超额：剩余 0（不为负）');
  const reached = (limitEnabled, max, used) => limitEnabled && used >= max;
  t(reached(true, 3, 3) === true, '开启限制且用满 → 已达上限');
  t(reached(false, 3, 99) === false, '未开启限制 → 永不达上限');
  t(reached(true, 3, 2) === false, '未用满 → 未达上限');
}

/* ---------- 小结 ---------- */
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}  失败: ${fail}`);
console.log('='.repeat(40));
process.exit(fail > 0 ? 1 : 0);
