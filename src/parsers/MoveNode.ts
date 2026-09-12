export type Side = 'K' | 'Q';
export type CentralFile = 'Q' | 'K';
export type WingFile = 'R' | 'N' | 'B';
export type PieceLetter = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

export interface Square {
  file: CentralFile | WingFile;
  side: Side | null;
  rank: number;
}

export type Origin =
  | { kind: 'none' }
  | { kind: 'side'; side: Side }
  | { kind: 'square'; square: Square }
  | { kind: 'file'; side: Side | null; file: WingFile };

export type Target =
  | { kind: 'square'; square: Square }
  | { kind: 'captured-piece'; piece: PieceLetter };

export interface Suffixes {
  check: 'check' | 'checkmate' | null;
  enPassant: boolean;
  annotation: '!' | '?' | '!!' | '??' | '!?' | '?!' | null;
}

export interface CastlingMove {
  type: 'castling';
  side: Side | null;
  suffixes: Suffixes;
}

export interface PieceMove {
  type: 'piece-move';
  piece: PieceLetter;
  origin: Origin;
  capture: boolean;
  target: Target;
  promotion: 'Q' | 'R' | 'B' | 'N' | null;
  suffixes: Suffixes;
}

export type MoveNode = CastlingMove | PieceMove;
