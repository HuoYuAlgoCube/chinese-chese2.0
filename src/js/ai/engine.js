/**
 * AI 引擎：把局面交给大模型，解析其返回的走法
 * 用于：人机对战（模块 2 的 AI 走子）与 AI 支招（模块 1）
 */
import { SIDE, PIECE, PIECE_LABEL, PIECE_VALUE } from '../core/constants.js';
import { isInCheck, generatePieceMoves } from '../core/rules.js';
import { moveNotation as moveNotationRaw } from '../core/notation.js';
import { findBestMove, scoreMoves, evaluateBoard } from './search.js';
import { createAIClient } from './client.js';

/** 坐标 -> 人类可读 */
export function posName(side, row, col) {
  const files = side === SIDE.RED
    ? ['九', '八', '七', '六', '五', '四', '三', '二', '一']
    : ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const ranks = side === SIDE.RED
    ? ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  return `${files[col]}路${ranks[row]}行`;
}

/**
 * 生成一步棋的中文记谱（统一走 core/notation.js，避免与 Game.describeMove 重复）
 * 保留 (game, side, from, to, piece) 签名以兼容本文件既有调用。
 */
export function moveNotation(game, side, from, to, piece) {
  return moveNotationRaw(game.board, side, from, to, piece);
}


/**
 * 构造局面文本（带行列坐标标注，便于模型定位）
 */
export function buildBoardText(game) {
  const board = game.board;
  const lines = [];
  lines.push('     列:  0    1    2    3    4    5    6    7    8');
  for (let row = 0; row < 10; row++) {
    const cells = [];
    for (let col = 0; col < 9; col++) {
      const p = board.get(row, col);
      cells.push(p ? PIECE_LABEL[p.side][p.type] : '·');
    }
    const side = row <= 4 ? '黑' : '红';
    lines.push(`行${String(row).padStart(2, ' ')}(${side}):  ${cells.join('    ')}`);
  }
  return lines.join('\n');
}

/**
 * 分析一步走法的战术价值，用于给清单加标注
 */
function analyzeMove(game, side, move) {
  const tags = [];
  const board = game.board;
  const mover = board.get(move.from.row, move.from.col);
  const captured = board.get(move.to.row, move.to.col);

  // 吃子
  if (captured) {
    const gain = PIECE_VALUE[captured.type] || 0;
    const risk = PIECE_VALUE[mover.type] || 0;
    if (captured.type === PIECE.KING) tags.push('吃掉对方将帅');
    else if (gain >= risk) tags.push(`吃${PIECE_LABEL[captured.side][captured.type]}(赚)`);
    else tags.push(`吃${PIECE_LABEL[captured.side][captured.type]}`);
  }

  // 模拟走子后判断是否将军 / 是否被反将
  const clone = board.clone();
  clone.set(move.to.row, move.to.col, clone.get(move.from.row, move.from.col));
  clone.set(move.from.row, move.from.col, null);
  const opp = side === SIDE.RED ? SIDE.BLACK : SIDE.RED;
  if (isInCheck(clone, opp)) tags.push('将军');

  // 是否会被对方吃掉（简单看目标点是否在对方攻击范围）
  const oppAttacks = collectAttacks(clone, opp);
  if (oppAttacks.has(`${move.to.row},${move.to.col}`) && !captured) {
    tags.push('可能被吃');
  }

  return tags.length ? ` 【${tags.join('，')}】` : '';
}

/** 收集某方所有伪合法攻击点 */
function collectAttacks(board, side) {
  const set = new Set();
  for (const { row, col } of board.findPieces(side)) {
    for (const m of generatePieceMoves(board, row, col)) set.add(`${m.row},${m.col}`);
  }
  return set;
}

/**
 * 生成合法走法清单文本（中文记谱 + 坐标 + 战术标注）
 */
export function buildMovesText(game, side, searchTags, orderedMoves) {
  const board = game.board;
  const moves = orderedMoves || game.getLegalMoves(side);
  return moves
    .map((m, i) => {
      // 传入的 orderedMoves 可能只含 {move} 包装，这里统一取 move
      const mv = m.move || m;
      const p = board.get(mv.from.row, mv.from.col);
      const notation = moveNotation(game, side, mv.from, mv.to, p);
      const tag = analyzeMove(game, side, mv);
      const key = `${mv.from.row},${mv.from.col},${mv.to.row},${mv.to.col}`;
      const search = searchTags && searchTags.get(key) ? ` [${searchTags.get(key)}]` : '';
      // 序号前置，既是给模型的答案标识，也便于按序号回查
      return `  ${String(i + 1).padStart(3, ' ')}. ${notation}  ← 坐标(${mv.from.row},${mv.from.col})→(${mv.to.row},${mv.to.col})${tag}${search}`;
    })
    .join('\n');
}

/**
 * 用本地搜索对走法清单排序，返回排序后的走法列表与注释
 * @returns {{ordered:Array, annotations:Map<string,string>, bestKey:string|null}}
 */
export function rankMovesBySearch(game, side, depth = 2) {
  const moves = game.getLegalMoves(side);
  const scores = scoreMoves(game, side, depth);
  const annotated = moves.map((m) => {
    const key = `${m.from.row},${m.from.col},${m.to.row},${m.to.col}`;
    return { move: m, key, score: scores.get(key) ?? -Infinity };
  });
  // 从高到低排序
  annotated.sort((a, b) => b.score - a.score);

  const annotations = new Map();
  annotated.forEach((item, i) => {
    let tag = '';
    if (i === 0) tag = '本地引擎评分最高';
    else if (i < 3) tag = '本地引擎评分较高';
    else if (item.score < -200) tag = '本地引擎判定为亏损';
    annotations.set(item.key, tag);
  });

  return {
    ordered: annotated,
    annotations,
    bestKey: annotated.length ? annotated[0].key : null,
  };
}

/**
 * 生成最近走子历史（中文记谱）
 */
export function buildHistoryText(game, limit = 8) {
  const hist = game.history.slice(-limit);
  if (!hist.length) return '（开局，尚无走子记录）';
  const start = game.history.length - hist.length;
  return hist
    .map((h, i) => {
      const n = start + i + 1;
      const who = h.side === SIDE.RED ? '红' : '黑';
      const notation = moveNotation(game, h.side, h.from, h.to, h.piece);
      const cap = h.captured ? `（吃${PIECE_LABEL[h.captured.side][h.captured.type]}）` : '';
      return `  ${n}. ${who}方 ${notation}${cap}`;
    })
    .join('\n');
}

const SYSTEM_PROMPT = `你是「廖老爷」，一位象棋阁主、特级大师，精通开局定式、中局战术与残局杀法。
你说话有老派棋手的味道，点评简明、有底气，偶尔一两句口头禅（如"依我看""这步有讲究"），但不要啰嗦。

【坐标系统】严格使用下面这套数字坐标，不要使用中文记谱坐标：
- row（行）：0 到 9，自上而下。row=0 是黑方底线，row=9 是红方底线。
- col（列）：0 到 8，自左向右。col=0 是最左竖线，col=8 是最右竖线。
- 例：红方中炮从 (7,1) 走到 (7,4)；黑方卒从 (3,6) 走到 (4,6)。

【决策要求】按以下优先级综合判断：
1. 若己方被将军，必须优先解将（移动将帅、吃掉将军棋子、或用子挡住）。
2. 能将军、能吃掉对方大子（车>炮≈马>兵）、能形成杀势的走法优先。
3. 必须避免己方大子被白吃；除非能换回更大价值或形成连续攻击。
4. 开局阶段（前 10 回合）应尽快出动大子、抢占中路与要道，
   切勿用炮/马/车去无谓兑子或贪吃兵卒而丧失先手。
5. 中残局阶段注意：过河兵卒价值提升，缺士怕马、缺象怕炮。

【关于"本地引擎评分"】走法清单会给出本地搜索引擎的排序与战术标注，它只做短距离算度（易受"吃子后又被吃回"的误判影响），可作参考但不应盲从。当本地引擎推荐的开局兑子与象棋棋理冲突时，以棋理为准。

【输出格式】从清单中选择一步，用它的"序号"作答。只输出一个 JSON 对象，
不要输出任何解释文字，不要使用 markdown 代码块：
{"index": 序号整数, "reason": "以「廖老爷」口吻用一句话说明这步的战术意图"}

其中 index 必须是你所选那一步在清单中显示的序号。这是唯一的输出要求，务必严格遵守。`;

/**
 * 从模型返回文本中解析走法坐标
 */
export function parseMoveFromText(text) {
  if (!text) return null;
  let t = text.trim().replace(/```(?:json)?/gi, '').trim();

  // 优先尝试 JSON
  const jsonMatch = t.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      const move = normalizeMoveObject(obj);
      if (move) return move;
    } catch {
      // 继续尝试其他方式
    }
  }

  // 尝试数组格式 [fromRow, fromCol, toRow, toCol]
  const arr = t.match(/\[\s*(\d)\s*[,，]\s*(\d)\s*[,，]\s*(\d)\s*[,，]\s*(\d)\s*\]/);
  if (arr) {
    return { fromRow: +arr[1], fromCol: +arr[2], toRow: +arr[3], toCol: +arr[4], reason: '' };
  }

  // 退路：正则匹配 (r,c) -> (r,c)
  const pair = t.match(/\(?\s*(\d)\s*[,，]\s*(\d)\s*\)?\s*(?:->|→|到|至|走至|走到)\s*\(?\s*(\d)\s*[,，]\s*(\d)\s*\)?/);
  if (pair) {
    return { fromRow: +pair[1], fromCol: +pair[2], toRow: +pair[3], toCol: +pair[4], reason: '' };
  }

  // 退路：匹配 "fromRow":7 这种松散键值
  const loose = (key) => {
    const m = t.match(new RegExp(`["']?${key}["']?\\s*[:：]?\\s*(\\d)`, 'i'));
    return m ? +m[1] : NaN;
  };
  const fr = loose('fromRow'), fc = loose('fromCol'), tr = loose('toRow'), tc = loose('toCol');
  if (![fr, fc, tr, tc].some(Number.isNaN)) {
    return { fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, reason: '' };
  }

  // 退路：{"from":{"row":7,"col":1},"to":{...}} 嵌套对象
  const nested = t.match(
    /"from"\s*:\s*\{\s*"row"\s*:\s*(\d)\s*,\s*"col"\s*:\s*(\d)\s*\}[\s\S]*?"to"\s*:\s*\{\s*"row"\s*:\s*(\d)\s*,\s*"col"\s*:\s*(\d)\s*\}/,
  );
  if (nested) {
    return { fromRow: +nested[1], fromCol: +nested[2], toRow: +nested[3], toCol: +nested[4], reason: '' };
  }

  return null;
}

/**
 * 解析模型返回中的"序号"（清单第几条），用于最稳妥的定位方式
 * 支持：{"index": 12} / "选择第 12 步" / "12." 等
 */
export function parseIndexFromText(text) {
  if (!text) return null;
  const t = String(text).trim();

  // JSON 里的 index / choice / move 字段
  const jsonMatch = t.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      for (const k of ['index', 'idx', 'choice', 'move', 'selected', '序号']) {
        if (obj[k] !== undefined && obj[k] !== null) {
          const n = Number(obj[k]);
          if (!Number.isNaN(n)) return n;
        }
      }
    } catch {
      /* 忽略 */
    }
  }

  // 中文："第 12 步" / "第12条" / "选择序号12"
  const cn = t.match(/(?:第|序号|选择|选)\s*(\d{1,3})\s*(?:步|条|个|项|号)?/);
  if (cn) return +cn[1];

  // 形如 "12." 开头的纯数字
  const bare = t.match(/^\s*(\d{1,3})\s*[.、)）]?\s*$/);
  if (bare) return +bare[1];

  return null;
}

/**
 * 用中文记谱在走法清单中查找匹配的走法
 * @param {Array} annotated 形如 [{move,key,score}] 或 [{from,to,captured}]
 * @param {object} game
 * @param {string} side
 * @param {string} text 模型返回文本
 */
export function matchByNotation(game, side, text, orderedMoves) {
  if (!text) return null;
  const cleaned = String(text).replace(/[\s　]/g, '');
  for (const item of orderedMoves) {
    const m = item.move || item;
    const p = game.board.get(m.from.row, m.from.col);
    if (!p) continue;
    const notation = moveNotation(game, side, m.from, m.to, p);
    if (cleaned.includes(notation)) return { move: m, from: m.from, to: m.to };
  }
  return null;
}

function normalizeMoveObject(obj) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null) return Number(obj[k]);
    }
    return NaN;
  };
  const fromRow = pick('fromRow', 'from_row', 'fr', 'fromX');
  const fromCol = pick('fromCol', 'from_col', 'fc', 'fromY');
  const toRow = pick('toRow', 'to_row', 'tr', 'toX');
  const toCol = pick('toCol', 'to_col', 'tc', 'toY');
  if ([fromRow, fromCol, toRow, toCol].some((n) => Number.isNaN(n))) return null;
  return { fromRow, fromCol, toRow, toCol, reason: obj.reason || obj.explain || '' };
}

/**
 * 校验并命中合法走法
 * @param {Array} legal 合法走法列表（每项含 from/to）
 * @param {{from:{row,col}, to:{row,col}}} resolved 解析后的走法
 */
function matchLegalMove(legal, resolved) {
  if (!resolved || !resolved.from || !resolved.to) return null;
  return legal.find(
    (m) =>
      m.from.row === resolved.from.row &&
      m.from.col === resolved.from.col &&
      m.to.row === resolved.to.row &&
      m.to.col === resolved.to.col,
  );
}

/**
 * 把模型返回解析为具体走法。按鲁棒性依次尝试：
 *   1) 序号 index（最稳，与清单一一对应）
 *   2) 数字坐标（fromRow/fromCol/toRow/toCol）
 *   3) 中文记谱（如"炮八平五"）
 * @returns {{from:{row,col}, to:{row,col}, reason:string}|null}
 */
function resolveModelReply(reply, game, side, ordered) {
  const text = String(reply || '');

  // 1) 序号
  const idx = parseIndexFromText(text);
  if (idx !== null && idx >= 1 && idx <= ordered.length) {
    const item = ordered[idx - 1];
    const m = item.move || item;
    return {
      from: { row: m.from.row, col: m.from.col },
      to: { row: m.to.row, col: m.to.col },
      reason: extractReason(text),
    };
  }

  // 2) 数字坐标
  const coords = parseMoveFromText(text);
  if (coords) {
    return {
      from: { row: coords.fromRow, col: coords.fromCol },
      to: { row: coords.toRow, col: coords.toCol },
      reason: coords.reason || extractReason(text),
    };
  }

  // 3) 中文记谱
  const byNotation = matchByNotation(game, side, text, ordered);
  if (byNotation) {
    return { from: byNotation.from, to: byNotation.to, reason: extractReason(text) };
  }

  return null;
}

/** 从文本中尽量抽取 reason 字段 */
function extractReason(text) {
  const m = String(text).match(/["']?reason["']?\s*[:：]\s*["']([^"']{1,80})["']/);
  return m ? m[1] : '';
}

/**
 * 请求模型并解析为走法；解析失败会自动纠错重试一次
 * @returns {Promise<{from,to,reason}>}
 */
async function askModelForMove(client, game, side, ordered, buildPrompt, settings, legalCount) {
  const temperature = Math.min(settings.get('ai.temperature', 0.3), 0.3);
  const messages = buildPrompt();
  let reply = await client.chat(messages, { temperature });
  let resolved = resolveModelReply(reply, game, side, ordered);

  if (resolved) return resolved;

  // 解析失败 -> 强纠错重试
  const retryMessages = [
    ...messages,
    { role: 'assistant', content: reply },
    {
      role: 'user',
      content:
        `你的上一条回复无法解析。请只回答一个 JSON 对象，不要任何其他文字：\n` +
        `{"index": 序号, "reason": "简短理由"}\n` +
        `其中 index 是 1 到 ${legalCount} 之间的整数，对应清单中的序号。`,
    },
  ];
  reply = await client.chat(retryMessages, { temperature: 0 });
  resolved = resolveModelReply(reply, game, side, ordered);

  if (resolved) return resolved;

  // 最终仍无法解析：返回 null，由调用方使用本地引擎兜底，避免中断对局
  return null;
}

/** 本地引擎判定为「必杀」的评分阈值（搜索返回的将死分约 100000 级） */
const FORCED_MATE_SCORE = 90000;

/**
 * 若本地引擎首选着法为绝杀级，直接返回该着法（无需调用大模型）。
 * @param {object} game
 * @param {Array<{move:object, score:number}>} ordered 已按评分降序的走法
 * @returns {{from:object, to:object, reason:string, localMate:boolean}|null}
 */
export function maybeForcedMate(game, ordered) {
  if (!ordered || !ordered.length) return null;
  const top = ordered[0];
  if (!top || typeof top.score !== 'number' || top.score < FORCED_MATE_SCORE) return null;
  const mv = top.move || top;
  return {
    from: { row: mv.from.row, col: mv.from.col },
    to: { row: mv.to.row, col: mv.to.col },
    reason: '（本地引擎已算得绝杀，直接落子）',
    localMate: true,
  };
}

/**
 * 让 AI 选择一步走法
 * @returns {Promise<{from:{row,col}, to:{row,col}, reason:string}>}
 */
export async function requestAIMove(game, side, settings) {
  const client = createAIClient(settings);
  const legal = game.getLegalMoves(side);
  if (legal.length === 0) throw new Error('当前无合法走法');

  const sideName = side === SIDE.RED ? '红方' : '黑方';
  const oppName = side === SIDE.RED ? '黑方' : '红方';
  const inCheck = isInCheck(game.board, side);

  // 本地搜索分析：给出评分排序，作为大模型的参考（大模型负责最终决策与理由）
  const searchDepth = settings.get('ai.searchDepth', 2);
  const { annotations, ordered, bestKey } = rankMovesBySearch(game, side, searchDepth);
  const bestHint = bestKey
    ? (() => {
        const top = ordered[0];
        const p = game.board.get(top.move.from.row, top.move.from.col);
        return moveNotation(game, side, top.move.from, top.move.to, p);
      })()
    : '';
  const evalScore = evaluateBoard(game.board, true);
  const evalText = side === SIDE.RED
    ? (evalScore > 50 ? '红方略优' : evalScore < -50 ? '黑方略优' : '双方均势')
    : (evalScore > 50 ? '红方略优（对你不利）' : evalScore < -50 ? '黑方略优（对你有利）' : '双方均势');

  // 本地引擎找到「绝杀/必杀」级着法时直接采纳，不再请求大模型：
  // 既保证走子绝对正确，又省去一次 API 往返与 token 消耗。
  const mateInfo = maybeForcedMate(game, ordered);
  if (mateInfo) return mateInfo;

  const buildPrompt = () => [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `当前局面（· 为空位）：\n${buildBoardText(game)}\n\n` +
        `最近走子记录：\n${buildHistoryText(game)}\n\n` +
        `形势判断：${evalText}\n` +
        `现在轮到【${sideName}】走子${inCheck ? '，⚠️ 你正被将军，必须解将！' : ''}。对方为【${oppName}】。\n\n` +
        `本地搜索引擎的参考建议：首选 ${bestHint}（下方清单第 1 条）。\n` +
        `注意：本地引擎只做短距离算度，不懂开局定式。你可以采纳它，也可以根据象棋棋理（如开局出子、抢占要道、避免无谓兑子）做出更好的选择，但**不要选标注为"本地引擎判定为亏损"的走法**。\n\n` +
        `你的全部合法走法（共 ${legal.length} 步，已按本地引擎评分从高到低排列，每行开头是序号）：\n${buildMovesText(game, side, annotations, ordered)}\n\n` +
        `请选择最有利的一步，用其序号作答，严格按 JSON 格式输出：{"index": 序号, "reason": "简短理由"}`,
    },
  ];

  const resolved = await askModelForMove(client, game, side, ordered, buildPrompt, settings, legal.length);
  const matched = resolved ? matchLegalMove(legal, resolved) : null;
  if (!matched) {
    // 兜底：模型给的位置不合法时，采用本地引擎首选，保证对局能继续
    if (ordered.length) {
      const top = ordered[0].move || ordered[0];
      return {
        from: { row: top.from.row, col: top.from.col },
        to: { row: top.to.row, col: top.to.col },
        reason: '（AI 建议不合法，已改用本地引擎推荐着法）',
        fallback: true,
      };
    }
    throw new Error(
      `AI 给出的走法不在合法清单中: (${resolved.from.row},${resolved.from.col})->(${resolved.to.row},${resolved.to.col})`,
    );
  }

  return {
    from: { row: resolved.from.row, col: resolved.from.col },
    to: { row: resolved.to.row, col: resolved.to.col },
    reason: resolved.reason || '',
  };
}

/**
 * AI 支招：给人类玩家建议一步（不落子）
 */
export async function requestHint(game, side, settings) {
  const client = createAIClient(settings);
  const legal = game.getLegalMoves(side);
  if (legal.length === 0) throw new Error('当前无合法走法，无支招可用');

  const sideName = side === SIDE.RED ? '红方' : '黑方';
  const oppName = side === SIDE.RED ? '黑方' : '红方';
  const inCheck = isInCheck(game.board, side);

  const searchDepth = settings.get('ai.searchDepth', 2);
  const { annotations, ordered, bestKey } = rankMovesBySearch(game, side, searchDepth);
  const bestHint = bestKey
    ? (() => {
        const top = ordered[0];
        const p = game.board.get(top.move.from.row, top.move.from.col);
        return moveNotation(game, side, top.move.from, top.move.to, p);
      })()
    : '';
  const evalScore = evaluateBoard(game.board, true);
  const evalText = evalScore > 50 ? '红方略优' : evalScore < -50 ? '黑方略优' : '双方均势';

  // 本地引擎已算得绝杀：直接作为支招返回，无需调用大模型
  const mateInfo = maybeForcedMate(game, ordered);
  if (mateInfo) {
    return {
      from: mateInfo.from,
      to: mateInfo.to,
      reason: '（本地引擎已算得绝杀，照此落子）',
      localMate: true,
    };
  }

  const buildPrompt = () => [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `当前局面（· 为空位）：\n${buildBoardText(game)}\n\n` +
        `最近走子记录：\n${buildHistoryText(game)}\n\n` +
        `形势判断：${evalText}\n` +
        `请为【${sideName}】推荐一步最佳走法（对手为【${oppName}】）${inCheck ? '，⚠️ 该方正被将军，必须解将！' : ''}。\n\n` +
        `本地搜索引擎的参考建议：首选 ${bestHint}（下方清单第 1 条）。\n` +
        `你可以采纳，也可以结合棋理给出更好的走法，但**不要推荐标注为"本地引擎判定为亏损"的走法**。\n\n` +
        `该方全部合法走法（共 ${legal.length} 步，已按本地引擎评分从高到低排列，每行开头是序号）：\n${buildMovesText(game, side, annotations, ordered)}\n\n` +
        `请选出最有利的一步，用其序号作答，严格按 JSON 格式输出：{"index": 序号, "reason": "简短理由"}`,
    },
  ];

  const resolved = await askModelForMove(client, game, side, ordered, buildPrompt, settings, legal.length);
  const matched = resolved ? matchLegalMove(legal, resolved) : null;
  if (!matched) {
    if (ordered.length) {
      const top = ordered[0].move || ordered[0];
      return {
        from: { row: top.from.row, col: top.from.col },
        to: { row: top.to.row, col: top.to.col },
        reason: '（AI 建议不合法，已改用本地引擎推荐着法）',
        fallback: true,
      };
    }
    throw new Error(
      `AI 建议的走法不在合法清单中: (${resolved.from.row},${resolved.from.col})->(${resolved.to.row},${resolved.to.col})`,
    );
  }

  return {
    from: { row: resolved.from.row, col: resolved.from.col },
    to: { row: resolved.to.row, col: resolved.to.col },
    reason: resolved.reason || '',
  };
}

/* ============================================================
   「廖老爷」AI 评语生成
   与走子决策分离：走子完成后异步请求评语，失败返回 null，
   由调用方降级到本地句库，绝不阻断对局。
   ============================================================ */

const COMMENT_SYSTEM_PROMPT = `你是「廖老爷」，一位象棋阁主、特级大师。你要对刚刚落下的一步棋做点评。
你说话有老派棋手的味道：点评简明、有底气，偶尔一两句口头禅（如"依我看""这步有讲究"），不啰嗦。

【必须遵守】
1. 评语必须**明确对象**：是谁走了这步棋、你在点评谁。用 target 字段说明。
2. 若点评的是「廖老爷自己」走的棋（自评），用自评口吻，克制而不吹牛；不可过度自夸。
3. 若点评的是玩家的走法：
   - 走出好棋（吃大子、将军、妙手）要赞许；
   - 若走出**明显失误**（白送大车/大子且无补偿），要**犀利毒舌**，如"臭棋篓子的味道出来了""这是送子呢还是送礼呢"，但不出恶言、不人身攻击。
4. 不使用 markdown，不使用代码块。

【输出格式】只输出一个 JSON 对象，不要任何解释文字：
{"target": "red" | "black" | "self", "tone": "praise" | "neutral" | "sharp" | "self", "text": "一句话评语"}
其中 target 指被点评的一方（red=红方，black=黑方，self=廖老爷自己）；若是廖老爷自评，target 必须为 "self"。`;

/**
 * 解析模型返回的评语 JSON，缺字段时做启发式补齐。
 * @param {string} text
 * @param {{fallbackTarget?:string, isSelf?:boolean}} [opts]
 * @returns {{target:string, tone:string, text:string}|null}
 */
export function parseCommentReply(text, opts = {}) {
  if (!text) return null;
  const t = String(text).trim().replace(/```(?:json)?/gi, '').trim();

  let target = '';
  let tone = '';
  let body = '';

  const jsonMatch = t.match(/{[\s\S]*?}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      body = String(obj.text || obj.comment || obj.reply || obj.评语 || '').trim();
      target = String(obj.target || obj.对象 || '').trim().toLowerCase();
      tone = String(obj.tone || obj.语气 || '').trim().toLowerCase();
    } catch {
      /* 退化到纯文本 */
    }
  }

  // 非 JSON：整段文本当作评语正文
  if (!body) body = t;
  if (!body) return null;

  const isSelf = !!opts.isSelf || /^(self|廖老爷自己|自己)$/.test(target);
  // 对象补齐：优先显式 target，其次按文案前缀/关键词，最后回退调用方给定 target
  if (!['red', 'black', 'self'].includes(target)) {
    if (/^(self|廖老爷自己|自己)$/.test(target) || /廖老爷(?:自评|自己|这步|这手|这局)/.test(body)) target = 'self';
    else if (/红方|红棋|红/.test(body) && !/黑/.test(body)) target = 'red';
    else if (/黑方|黑棋|黑/.test(body) && !/红/.test(body)) target = 'black';
    else target = opts.fallbackTarget || (isSelf ? 'self' : '');
  }
  if (target === 'self') {
    tone = 'self';
  } else if (!['praise', 'neutral', 'sharp', 'self'].includes(tone)) {
    if (/臭棋|白送|送礼|大方|摇头|没长眼|送子|糊涂|昏招|要不得/.test(body)) tone = 'sharp';
    else if (/妙|好棋|漂亮|精彩|赞|不错|利落|有灵气|占先/.test(body)) tone = 'praise';
    else tone = 'neutral';
  }

  return { target: target || 'red', tone, text: body };
}

/**
 * 请求一句「廖老爷」评语（对象明确）。
 * @param {object} ctx
 * @param {object} ctx.piece 走动的棋子 {type, side}
 * @param {object|null} ctx.captured 被吃棋子
 * @param {boolean} ctx.check 是否将军
 * @param {boolean} ctx.matchOver 是否终局
 * @param {number} ctx.moveNumber 已走步数
 * @param {boolean} [ctx.sideLosesBig] 行棋方白丢大子
 * @param {string} [ctx.notation] 中文记谱
 * @param {string} [ctx.side] 行棋方 red|black
 * @param {boolean} [ctx.isSelf] 是否为廖老爷自评（人机模式 AI 走子）
 * @param {string} [ctx.boardText] 局面文本
 * @param {string} [ctx.historyText] 走子历史文本
 * @param {object} settings SettingsManager
 * @returns {Promise<{target:string, tone:string, text:string}|null>} 失败/未配置返回 null
 */
export async function requestComment(ctx = {}, settings) {
  try {
    const key = settings.get('ai.apiKey', '');
    const base = settings.get('ai.baseUrl', '');
    if (!key || !key.trim() || !base || !base.trim()) return null;

    const client = createAIClient(settings);
    const side = ctx.side || (ctx.piece && ctx.piece.side) || SIDE.RED;
    const sideName = side === SIDE.RED ? '红方' : '黑方';
    const moverName = ctx.isSelf ? '廖老爷自己' : sideName;
    const pieceName = ctx.piece ? PIECE_LABEL[side][ctx.piece.type] : '棋子';
    const capName = ctx.captured ? PIECE_LABEL[ctx.captured.side][ctx.captured.type] : '';
    const notation = ctx.notation || '';

    const facts = [
      `行棋方：${sideName}（${ctx.isSelf ? '即廖老爷本人' : '玩家' }）`,
      notation ? `着法：${notation}` : '',
      `走动棋子：${pieceName}`,
      ctx.captured ? `吃掉对方：${capName}` : '',
      ctx.check ? '此着将军' : '',
      ctx.matchOver ? '此着终结对局' : '',
      ctx.sideLosesBig ? '⚠️ 此着白送大子（明显失误）' : '',
      `当前步数：${ctx.moveNumber || 0}`,
    ].filter(Boolean).join('\n');

    const user = [
      ctx.boardText ? `当前局面：
${ctx.boardText}
` : '',
      ctx.historyText ? `最近走子：
${ctx.historyText}
` : '',
      `刚刚发生的一步棋：
${facts}`,
      ctx.isSelf
        ? '请以廖老爷自评的口吻点评自己这一步（target="self"）。'
        : `请以廖老爷的口吻点评${sideName}这一步（target="${side === SIDE.RED ? 'red' : 'black'}"）。`,
      '严格输出 JSON：{"target": "red|black|self", "tone": "praise|neutral|sharp|self", "text": "一句话评语"}',
    ].filter(Boolean).join('\n\n');

    const reply = await client.chat(
      [
        { role: 'system', content: COMMENT_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      { temperature: Math.min(settings.get('ai.temperature', 0.3) || 0.3, 0.7), maxTokens: 200 },
    );

    return parseCommentReply(reply, {
      isSelf: !!ctx.isSelf,
      fallbackTarget: ctx.isSelf ? 'self' : (side === SIDE.BLACK ? 'black' : 'red'),
    });
  } catch {
    // 任何失败（未配置/超时/CORS/解析）都降级，不打断对局
    return null;
  }
}
