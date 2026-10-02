/**
 * 「廖老爷」个性化模块测试
 * 用法：node tests/persona.test.mjs
 */
import {
  PERSONA,
  avatarUrl,
  judgeMove,
  judgeInCheck,
  judgeUndo,
  hintPhrase,
  blunderLine,
  randomQuote,
  personaSays,
  withPersona,
  evaluateMoveOutcome,
} from '../src/js/core/persona.js';
import { SIDE } from '../src/js/core/constants.js';
import { PIECE, PIECE_VALUE } from '../src/js/core/constants.js';
import { Game } from '../src/js/core/game.js';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
const t = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.error(`  ✗ ${msg}`); } };
const section = (n) => console.log(`\n== ${n} ==`);

/* ---------- 人物标签 ---------- */
section('人物标签');
{
  t(PERSONA.name === '廖老爷', '人物名为「廖老爷」');
  t(typeof PERSONA.motto === 'string' && PERSONA.motto.length > 0, '有座右铭');
  t(typeof PERSONA.signature === 'string' && PERSONA.signature.includes('廖老爷'), '有署名');
  t(typeof PERSONA.title === 'string' && PERSONA.title.length > 0, '有头衔');
}

/* ---------- 形象资源 ---------- */
section('形象资源');
{
  const url = avatarUrl();
  t(typeof url === 'string' && url.startsWith('file://'), 'avatarUrl 返回文件 URL');
  const p = fileURLToPath(url);
  t(existsSync(p), '形象文件真实存在: ' + p.split(/[\\/]/).pop());
  t(PERSONA.avatar.includes('liaolord.gif') || PERSONA.avatar.includes('人像卡通化.gif'), 'PERSONA.avatar 指向形象文件: ' + PERSONA.avatar);
}

/* ---------- 评语生成 ---------- */
section('评语生成');
{
  const base = { moveNumber: 3, notation: '炮八平五' };

  const normal = judgeMove({ ...base, piece: { type: PIECE.CANNON }, captured: null, check: false });
  t(typeof normal === 'string' && normal.length > 0, '普通着法返回评语');

  const cap = judgeMove({ ...base, piece: { type: PIECE.CANNON }, captured: { type: PIECE.ROOK }, check: false });
  t(typeof cap === 'string' && cap.length > 0, '吃子返回评语');

  const check = judgeMove({ ...base, piece: { type: PIECE.ROOK }, captured: null, check: true });
  t(check.includes('将'), '将军评语含「将」字: ' + check);

  const win = judgeMove({ ...base, piece: { type: PIECE.ROOK }, captured: null, check: false, matchOver: true });
  t(typeof win === 'string' && win.length > 0, '终局返回取胜评语');

  const loss = judgeMove({ ...base, piece: { type: PIECE.ROOK }, captured: null, check: false, sideLosesBig: true });
  t(typeof loss === 'string' && loss.length > 0, '亏损返回评语');

  // 同一输入稳定输出
  const a = judgeMove({ ...base, piece: { type: PIECE.CANNON }, captured: null, check: false });
  const b = judgeMove({ ...base, piece: { type: PIECE.CANNON }, captured: null, check: false });
  t(a === b, '同一局面评语稳定（不随机抖动）');

  // 不同阶段有不同评语
  const open = judgeMove({ moveNumber: 2, piece: { type: PIECE.PAWN }, captured: null, check: false });
  const mid = judgeMove({ moveNumber: 20, piece: { type: PIECE.PAWN }, captured: null, check: false });
  const end = judgeMove({ moveNumber: 60, piece: { type: PIECE.PAWN }, captured: null, check: false });
  t(open !== mid || mid !== end, '不同阶段评语有变化');
}

/* ---------- 被将军评语 ---------- */
section('被将军评语');
{
  const q = judgeInCheck(1);
  t(typeof q === 'string' && q.length > 0, '返回被将军评语: ' + q);
  t(judgeInCheck(1) === judgeInCheck(1), '同一 seed 输出稳定');
}

/* ---------- 口吻包装 ---------- */
section('口吻包装');
{
  const s1 = personaSays('这步不错');
  t(s1.startsWith('【廖老爷】'), 'personaSays 加【廖老爷】前缀: ' + s1);

  const s2 = withPersona('这步不错');
  t(s2.includes('廖老爷'), 'withPersona 加署名');

  const s3 = withPersona('这步不错', false);
  t(!s3.includes('——'), 'withPersona(false) 不加署名');
}

/* ---------- 犀利评语（明显失误） ---------- */
section('犀利评语');
{
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    seen.add(blunderLine({ moveNumber: i, piece: { type: PIECE.ROOK } }));
  }
  t(seen.size >= 4, `犀利评语池足够丰富（${seen.size} 种）`);
  t([...seen].every((q) => typeof q === 'string' && q.length > 0), '犀利评语均为非空');

  // 应包含"臭棋篓子"这类毒舌表达
  const all = [...seen].join('');
  t(/臭棋|白送|大方|摇头|没长眼|送子|送礼/.test(all), '犀利评语包含毒舌表达');

  // 同一输入稳定
  const a = blunderLine({ moveNumber: 5, piece: { type: PIECE.ROOK } });
  const b = blunderLine({ moveNumber: 5, piece: { type: PIECE.ROOK } });
  t(a === b, '同一局面犀利评语稳定');

  // 明显失误走 judgeMove 应走犀利档
  const q = judgeMove({
    piece: { type: PIECE.ROOK }, captured: null, check: false,
    sideLosesBig: true, sideGains: 0, sideLoses: 600, moveNumber: 10,
  });
  t(typeof q === 'string' && q.length > 0, '明显失误返回评语');
}

/* ---------- 妙手评语 ---------- */
section('妙手评语');
{
  const q = judgeMove({
    piece: { type: PIECE.ROOK }, captured: { type: PIECE.ROOK },
    check: true, moveNumber: 20,
  });
  t(typeof q === 'string' && q.length > 0, '吃大子+将军返回妙手评语: ' + q);
}

/* ---------- 悔棋 / 支招话术 ---------- */
section('悔棋与支招话术');
{
  const u1 = judgeUndo(1), u2 = judgeUndo(2);
  t(typeof u1 === 'string' && u1.length > 0, '悔棋调侃非空: ' + u1);
  t(/反悔|棋品|悔一步|重来|面子/.test(u1 + u2), '悔棋调侃含相关表达');

  const set = new Set();
  for (let i = 0; i < 20; i++) set.add(hintPhrase(i));
  t(set.size >= 3, `支招话术多样（${set.size} 种）`);
}

/* ---------- 送子检测 ---------- */
section('送子检测');
{
  // 构造：红车走到黑车口中
  const g = new Game();
  g.board.clear();
  g.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });
  g.board.set(4, 0, { type: PIECE.ROOK, side: SIDE.BLACK });
  g.board.set(9, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g.turn = SIDE.RED;

  const r = g.move({ row: 9, col: 0 }, { row: 6, col: 0 });
  t(r.ok, '红车可走到 (6,0)');
  if (r.ok) {
    const snap = g.history[g.history.length - 1];
    const out = evaluateMoveOutcome(g, snap, SIDE.RED);
    t(out.sideLoses > 0, `检测到送子（loses=${out.sideLoses}）`);
    t(out.sideLoses >= 270, '丢的是大子');
  }

  // 安全着法不应被判为送子
  const g2 = new Game();
  g2.board.clear();
  g2.board.set(9, 4, { type: PIECE.KING, side: SIDE.RED });
  g2.board.set(0, 4, { type: PIECE.KING, side: SIDE.BLACK });
  g2.board.set(5, 4, { type: PIECE.PAWN, side: SIDE.BLACK });
  g2.board.set(9, 0, { type: PIECE.ROOK, side: SIDE.RED });
  g2.turn = SIDE.RED;
  const r2 = g2.move({ row: 9, col: 0 }, { row: 8, col: 0 });
  if (r2.ok) {
    const snap2 = g2.history[g2.history.length - 1];
    const out2 = evaluateMoveOutcome(g2, snap2, SIDE.RED);
    t(out2.sideLoses === 0, '安全着法不判为送子');
  }
}

/* ---------- AI 人设 ---------- */
section('AI 人设');
{
  t(typeof PERSONA.aiTaunt === 'string' && PERSONA.aiTaunt.length > 0, '有 AI 对手台词: ' + PERSONA.aiTaunt);
  t(PERSONA.title === '象棋阁主', '头衔为象棋阁主');
}

/* ---------- 随机评语池 ---------- */
section('随机评语池');
{
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(randomQuote(i));
  t(seen.size >= 8, `评语池足够丰富（取样 ${seen.size} 种）`);
  for (const q of seen) {
    if (typeof q !== 'string' || q.length === 0) { t(false, '评语均为非空字符串'); break; }
  }
  t(true, '评语均为非空字符串');
}

/* ---------- 常量依赖 ---------- */
section('常量依赖');
{
  t(typeof PIECE_VALUE[PIECE.ROOK] === 'number', 'PIECE_VALUE 可用（评语分级依赖）');
  t(PIECE_VALUE[PIECE.ROOK] > PIECE_VALUE[PIECE.PAWN], '大子价值高于兵卒');
}
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}  失败: ${fail}`);;
console.log('='.repeat(40));
process.exit(fail > 0 ? 1 : 0);
