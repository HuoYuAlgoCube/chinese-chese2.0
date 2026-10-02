/**
 * 全局常量：棋盘尺寸、阵营、棋子类型
 * 坐标约定：col = 0..8 (左->右)，row = 0..9 (上->下，row=0 为黑方底线)
 */

export const COLS = 9;
export const ROWS = 10;

/** 阵营 */
export const SIDE = {
  RED: 'red',
  BLACK: 'black',
};

export const OPPONENT = {
  [SIDE.RED]: SIDE.BLACK,
  [SIDE.BLACK]: SIDE.RED,
};

/** 棋子类型 */
export const PIECE = {
  KING: 'K',   // 帥/將
  ADVISOR: 'A', // 仕/士
  ELEPHANT: 'E', // 相/象
  HORSE: 'H',  // 傌/馬
  ROOK: 'R',   // 俥/車
  CANNON: 'C',  // 炮/砲
  PAWN: 'P',   // 兵/卒
};

/** 棋子中文显示名 */
export const PIECE_LABEL = {
  [SIDE.RED]: {
    [PIECE.KING]: '帥',
    [PIECE.ADVISOR]: '仕',
    [PIECE.ELEPHANT]: '相',
    [PIECE.HORSE]: '傌',
    [PIECE.ROOK]: '俥',
    [PIECE.CANNON]: '炮',
    [PIECE.PAWN]: '兵',
  },
  [SIDE.BLACK]: {
    [PIECE.KING]: '將',
    [PIECE.ADVISOR]: '士',
    [PIECE.ELEPHANT]: '象',
    [PIECE.HORSE]: '馬',
    [PIECE.ROOK]: '車',
    [PIECE.CANNON]: '砲',
    [PIECE.PAWN]: '卒',
  },
};

/** 初始布局（row=0 为黑方底线） */
export const INITIAL_LAYOUT = [
  // 黑方 (上)
  ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'],
  [null, null, null, null, null, null, null, null, null],
  [null, 'C', null, null, null, null, null, 'C', null],
  ['P', null, 'P', null, 'P', null, 'P', null, 'P'],
  [null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null],
  ['P', null, 'P', null, 'P', null, 'P', null, 'P'],
  [null, 'C', null, null, null, null, null, 'C', null],
  [null, null, null, null, null, null, null, null, null],
  // 红方 (下)
  ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'],
];

/** 棋子价值（用于吃子/评估） */
export const PIECE_VALUE = {
  [PIECE.KING]: 10000,
  [PIECE.ROOK]: 600,
  [PIECE.CANNON]: 300,
  [PIECE.HORSE]: 270,
  [PIECE.ELEPHANT]: 120,
  [PIECE.ADVISOR]: 120,
  [PIECE.PAWN]: 60,
};

/** 初始布局中每种棋子属于哪一方 */
export const INITIAL_SIDE_BY_ROW = (row) => (row <= 4 ? SIDE.BLACK : SIDE.RED);

/** 列坐标 -> 用于走棋记谱的列号 */
export const COL_NAMES_RED = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];
export const COL_NAMES_BLACK = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
