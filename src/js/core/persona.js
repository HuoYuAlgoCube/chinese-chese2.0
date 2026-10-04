import { PIECE_VALUE } from './constants.js';

/**
 * 「廖老爷」个性化模块
 * 集中管理人物标签、形象资源与评语生成，供各模块统一调用。
 *
 * 资源位置：src/resources/liaolord.gif（1536×1536 GIF 动图）
 */

export const PERSONA = {
  name: '廖老爷',
  fullName: '廖老爷',
  title: '象棋阁主',
  // 形象资源路径（相对项目根 index.html）
  avatar: 'src/resources/liaolord.gif',
  // 备用静态形象（若动图加载失败时显示）
  fallbackText: '廖',
  motto: '棋如人生，落子无悔——廖老爷陪你下到底。',
  signature: '—— 廖老爷',
  // 人机对战时作为 AI 的自我介绍
  aiTaunt: '廖老爷执子，你可想好了再走。',
  // 自称（自评时使用）
  selfName: '廖老爷',
  // 对玩家的称呼池（点评玩家时随机点缀）
  epithet: ['阁下', '这位棋友', '小子', '老兄'],
  // 语气标签的中文名
  toneLabels: {
    praise: '赞许',
    neutral: '平和',
    sharp: '犀利',
    self: '自评',
  },
};

/** 评语对象 */
export const TARGET = {
  RED: 'red',
  BLACK: 'black',
  SELF: 'self',
};

/** 评语对象 -> 中文标签 */
export function commentTargetLabel(target) {
  if (target === TARGET.RED) return '红方';
  if (target === TARGET.BLACK) return '黑方';
  if (target === TARGET.SELF) return '廖老爷自己';
  return '本局';
}

/** 形象资源 URL（相对 src/resources/，供 JS 动态引用） */
export function avatarUrl() {
  return new URL('../../resources/liaolord.gif', import.meta.url).href;
}

/* ============================================================
   评语系统
   风格：老派棋手口吻，时而夸奖、时而毒舌，但不出恶言，
        以「犀利幽默」为度，避免人身攻击。
   ============================================================ */

/** 平常着法（不痛不痒） */
const NEUTRAL_QUOTES = [
  '稳扎稳打，是行家手笔。',
  '这一步不显山不露水，却暗藏后招。',
  '中规中矩，棋路正着呢。',
  '小子，这步走得踏实。',
  '棋盘如江湖，稳字当头。',
  '这步棋，像是想清楚了才落的。',
  '不冒进，好，廖老爷喜欢这种耐性。',
];

/** 开局阶段 */
const OPENING_QUOTES = [
  '开局要快出车马，莫要恋那点小兵。',
  '先手在中，气势就压住了。',
  '开局出子如调兵，讲究个速度。',
  '开局别磨蹭，大子摆开才见真章。',
  '这几步还像样，摆出个正经阵势来。',
];

/** 中局 */
const MIDGAME_QUOTES = [
  '中局纠缠，比的就是算度。',
  '到中局了，得多算三步再落子。',
  '局势胶着，一个疏忽就满盘皆输。',
  '中局见真功夫，光有蛮力可不行。',
  '这局面像一团乱麻，看谁先理清。',
];

/** 残局 */
const ENDGAME_QUOTES = [
  '残局了，一兵一卒都是宝。',
  '到了残局，功夫全在细处。',
  '残局不比蛮力，比耐心。',
  '残局一步错，前面全白忙。',
  '到这份上，就看谁的老底厚了。',
];

/** 吃子（赚） */
const CAPTURE_GOOD_QUOTES = [
  '好一手！得子不失先，妙。',
  '痛快！这一口吃得香。',
  '妙啊，这子吃得干净利落。',
  '眼力不错，廖老爷给你记一功。',
  '这一下算是把便宜占足了。',
];

/** 吃子（用小亏换大赚 / 一般吃子） */
const CAPTURE_QUOTES = [
  '吃是吃了，可得防着人家反咬一口。',
  '贪吃要有本钱，你这步还算有本钱。',
  '吃掉一子，先别乐，看看后手。',
  '便宜是占了，代价嘛……走着瞧。',
];

/** 亏损（丢大子） */
const LOSS_QUOTES = [
  '哎呀，这个大子丢得可惜。',
  '亏了个大家伙，赶紧找补回来。',
  '这一下心疼不心疼？廖老爷替你疼。',
  '大意了吧！棋盘上可没有后悔药。',
  '这步走得，廖老爷都要替你捏把汗。',
];

/** 明显失误（丢大子且无补偿）—— 犀利档 */
const BLUNDER_QUOTES = [
  '这一手，臭棋篓子的味道出来了。',
  '你这是送子呢，还是送礼呢？',
  '好家伙，白送一个车，出手比谁都大方。',
  '这般走法，棋摊老大爷都得摇头。',
  '我说句不中听的：这步跟没长眼睛似的。',
  '这一送，廖老爷都不好意思给你鼓掌。',
  '哎哟，这是把家底往人家门口搬呐。',
  '棋可以输，这么走可不兴啊。',
];

/** 将军 */
const CHECK_QUOTES = [
  '将军！这一手够辣。',
  '好一记将军，看对方怎么解。',
  '将声一响，人心就慌了。',
  '这一将，是奔着要害去的。',
  '将军！这才有点高手的样子。',
];

/** 被将军 */
const IN_CHECK_QUOTES = [
  '被将军了！先稳住，解将要紧。',
  '将府告急，快快应对。',
  '慌不得，解将的法子总有三条。',
  '被逼上门了，看你怎么脱身。',
];

/** 绝杀取胜 */
const WIN_QUOTES = [
  '绝杀！漂亮，廖老爷拍案叫绝。',
  '成杀！这盘棋可以收山了。',
  '妙到毫巅，胜得干净利落。',
  '杀得漂亮，这一局足以下酒。',
];

/** 妙手（吃到大子且形成将军/杀势） */
const BRILLIANT_QUOTES = [
  '这一手有灵气！廖老爷给你个大拇指。',
  '妙啊！这是棋里藏针，防不胜防。',
  '算得深，走得狠，像样的杀招。',
  '好棋！这一步能吹上三天。',
];

/** 悔棋时的调侃 */
const UNDO_QUOTES = [
  '又想反悔？回去可以，棋品可不能丢。',
  '落子无悔才是本事，不过……廖老爷准你这一次。',
  '悔一步不算输，悔多了可就没面子喽。',
  '行吧，重来，当没看见。',
];

/** 支招时的话术 */
const HINT_QUOTES = [
  '依我看，这一步最稳。',
  '我瞧这一步好。',
  '听廖老爷一句，走这儿。',
  '这步棋，你走不走？反正我要是你，我走。',
];

/** 人机模式：廖老爷走子后的自评（克制、不自我吹捧过度） */
const SELF_QUOTES = [
  '这一步我走得稳，先手不丢。',
  '依我看，这步占了要道，你得多留神。',
  '廖老爷这手不算凶，却把你的路子堵住了。',
  '这步棋我思量过了，看似平常，后招还在。',
  '我落子向来不贪，这步先站稳再说。',
  '这一手嘛，棋理正着，你且接着看。',
  '廖老爷不吹牛，这步确实中规中矩。',
  '这一步我留着后手，你小心别着了道。',
];

/** 人机模式：AI 自评（吃子/将军等有攻效时） */
const SELF_STRONG_QUOTES = [
  '这一手我算准了，你可别心疼。',
  '瞧见没？廖老爷这步是有备而来。',
  '这步棋我走得狠，接不接得住看你的了。',
  '我这一下占了便宜，你可要想清楚。',
  '这步是我早埋下的伏笔，如今收网了。',
];

const ALL = [
  ...NEUTRAL_QUOTES, ...OPENING_QUOTES, ...MIDGAME_QUOTES, ...ENDGAME_QUOTES,
  ...CAPTURE_GOOD_QUOTES, ...CAPTURE_QUOTES, ...LOSS_QUOTES, ...BLUNDER_QUOTES,
  ...CHECK_QUOTES, ...IN_CHECK_QUOTES, ...WIN_QUOTES, ...BRILLIANT_QUOTES,
  ...UNDO_QUOTES, ...HINT_QUOTES, ...SELF_QUOTES, ...SELF_STRONG_QUOTES,
];

/** 按种子稳定取一条评语（同一局面重复渲染时不抖动） */
function pick(list, seed = 0) {
  if (!list.length) return '';
  const i = Math.abs(Math.floor(seed)) % list.length;
  return list[i];
}

/**
 * 判断一步棋是否属于「明显失误」：
 * 白丢大子（车/炮/马）且没有换回等价或更大的子。
 * @param {object} ctx
 * @returns {boolean}
 */
function isBlunder(ctx) {
  const { sideGains = 0, sideLoses = 0, movedPieceValue = 0 } = ctx || {};
  if (sideLoses <= 0) return false;
  // 丢掉的大子价值明显高于换回的收益
  return sideLoses - sideGains >= 250;
}

/**
 * 为一次走子生成「廖老爷」评语
 * @param {object} ctx
 * @param {object} ctx.piece 走动的棋子
 * @param {object|null} ctx.captured 被吃棋子
 * @param {boolean} ctx.check 是否将军
 * @param {number} ctx.moveNumber 已走步数
 * @param {boolean} ctx.matchOver 是否终局
 * @param {boolean} ctx.sideLosesBig 行棋方白丢大子
 * @param {number} [ctx.sideGains] 本步获得的价值
 * @param {number} [ctx.sideLoses] 本步之后可能损失的价值
 * @returns {string}
 */
export function judgeMove(ctx) {
  const {
    piece, captured, check, matchOver, moveNumber = 0,
    sideLosesBig = false,
  } = ctx || {};

  const seed = (moveNumber + 1) * 7 + (piece ? piece.type.charCodeAt(0) : 0);

  if (matchOver) return pick(WIN_QUOTES, seed);

  // 妙手：吃到大子 + 将军
  if (check && captured && (PIECE_VALUE[captured.type] || 0) >= 270) {
    return pick(BRILLIANT_QUOTES, seed);
  }
  if (check) return pick(CHECK_QUOTES, seed);

  if (isBlunder(ctx) || sideLosesBig) {
    // 犀利档：明显失误；轻度亏损用 LOSS_QUOTES
    return isBlunder(ctx) ? pick(BLUNDER_QUOTES, seed) : pick(LOSS_QUOTES, seed);
  }

  if (captured) {
    const gain = PIECE_VALUE[captured.type] || 0;
    if (gain >= 270) return pick(CAPTURE_GOOD_QUOTES, seed);
    return pick(CAPTURE_QUOTES, seed);
  }

  if (moveNumber < 12) return pick(OPENING_QUOTES, seed);
  if (moveNumber < 40) return pick(MIDGAME_QUOTES, seed);
  return pick(ENDGAME_QUOTES, seed);
}

/**
 * 评估一条走子评语的语气档（用于给 UI 上色/标注，以及 AI 提示词参考）
 * @returns {'praise'|'neutral'|'sharp'}
 */
export function moveTone(ctx) {
  const { captured, check, matchOver, sideLosesBig = false } = ctx || {};
  if (matchOver) return 'praise';
  if (check && captured && (PIECE_VALUE[captured.type] || 0) >= 270) return 'praise';
  if (isBlunder(ctx) || sideLosesBig) return 'sharp';
  if (check || captured) return 'praise';
  return 'neutral';
}

/**
 * 带「对象」信息的走子评语（本地句库）。
 * target 指明这条评语在点评谁：红方 / 黑方 / 廖老爷自己。
 * 保留 judgeMove（返回 string）以兼容旧调用。
 * @param {object} ctx judgeMove 的参数，另可传 ctx.side
 * @param {{isSelf?:boolean}} [opts]
 * @returns {{target:string, text:string, tone:string}}
 */
export function judgeMoveLine(ctx = {}, opts = {}) {
  const isSelf = !!opts.isSelf;
  const target = isSelf ? TARGET.SELF : (ctx.side === 'black' ? TARGET.BLACK : TARGET.RED);
  if (isSelf) {
    const seed = (ctx.moveNumber || 0) * 5 + (ctx.piece ? ctx.piece.type.charCodeAt(0) : 0);
    const strong = ctx.check || ctx.captured;
    return { target, text: pick(strong ? SELF_STRONG_QUOTES : SELF_QUOTES, seed), tone: 'self' };
  }
  return { target, text: judgeMove(ctx), tone: moveTone(ctx) };
}

/**
 * 人机模式：廖老爷走子后的本地自评（AI 评语不可用时的兜底）。
 * @param {object} ctx 同 judgeMove
 * @returns {string}
 */
export function judgeSelfMove(ctx = {}) {
  return judgeMoveLine(ctx, { isSelf: true }).text;
}

/** 被将军时的评语 */
export function judgeInCheck(seed = 0) {
  return pick(IN_CHECK_QUOTES, seed);
}

/** 悔棋时的调侃 */
export function judgeUndo(seed = 0) {
  return pick(UNDO_QUOTES, seed);
}

/**
 * 取一条「明显失误」的犀利评语（人机模式下玩家走出坏棋时使用）
 * @param {object} ctx 走子上下文（含 piece/moveNumber）
 */
export function blunderLine(ctx = {}) {
  const seed = (ctx.moveNumber || 0) * 13 + (ctx.piece ? ctx.piece.type.charCodeAt(0) : 0);
  return pick(BLUNDER_QUOTES, seed);
}

/** 支招时的开场话术 */
export function hintPhrase(seed = 0) {
  return pick(HINT_QUOTES, seed);
}

/** 随机一条通用评语（用于界面点缀） */
export function randomQuote(seed = Date.now()) {
  return pick(ALL, seed);
}

/**
 * 包装任意一句文本为「廖老爷」口吻
 * @param {string} text
 * @param {boolean} [withSignature]
 */
export function withPersona(text, withSignature = true) {
  return withSignature ? `${text}${PERSONA.signature}` : text;
}

/** 生成带「廖老爷」前缀的提示语 */
export function personaSays(text) {
  return `【${PERSONA.name}】${text}`;
}

/**
 * 评估一步棋对行棋方的得失，用于判断是否为「明显失误」
 * 判定逻辑：对方能否在下一步白吃我刚走的这个子；若能，且
 * 我这一步换回的收益不足以弥补，则视为亏损（loses = 该子价值 - 已得收益）。
 *
 * @param {object} game 走子后的 Game
 * @param {object} snapshot 走子记录（含 piece/captured/from/to）
 * @param {string} side 行棋方
 * @returns {{sideGains:number, sideLoses:number, movedPieceValue:number}}
 */
export function evaluateMoveOutcome(game, snapshot, side) {
  const gains = snapshot.captured ? (PIECE_VALUE[snapshot.captured.type] || 0) : 0;
  const movedValue = PIECE_VALUE[snapshot.piece.type] || 0;
  let loses = 0;

  try {
    const opp = side === 'red' ? 'black' : 'red';
    const oppMoves = game.getLegalMoves(opp);
    // 对方是否有走法能直接吃到我方刚走过的这个子
    const canBeCaptured = oppMoves.some(
      (m) => m.to.row === snapshot.to.row && m.to.col === snapshot.to.col,
    );
    if (canBeCaptured) {
      // 净损失 = 被吃子价值 - 本步收益；仅当为净亏时才计
      const net = movedValue - gains;
      loses = net > 0 ? net : 0;
    }
  } catch {
    /* 忽略评估异常，不影响主流程 */
  }

  return { sideGains: gains, sideLoses: loses, movedPieceValue: movedValue };
}
