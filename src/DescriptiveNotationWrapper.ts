import type { Chess, Color, Move, PieceSymbol } from 'chess.js';
import type { Parser } from './parsers/Parser.js';
import { StandardParser } from './parsers/StandardParser.js';
import type {
  CentralFile,
  MoveNode,
  Origin,
  PieceLetter,
  Side,
  Square,
  Target,
  WingFile,
} from './parsers/MoveNode.js';

const CENTRAL_FILES: Record<CentralFile, string> = { Q: 'd', K: 'e' };
const WING_FILES: Record<WingFile, Record<Side, string>> = {
  R: { Q: 'a', K: 'h' },
  N: { Q: 'b', K: 'g' },
  B: { Q: 'c', K: 'f' },
};
const WINGS: readonly Side[] = ['Q', 'K'];

function toPieceSymbol(piece: PieceLetter): PieceSymbol {
  return piece.toLowerCase() as PieceSymbol;
}

// Descriptive ranks count from each player's own back rank, so they mirror
// between colors; files don't (a-h name the same files for both players).
function algebraicRank(rank: number, color: Color): number {
  return color === 'w' ? rank : 9 - rank;
}

function algebraicFiles(file: CentralFile | WingFile, side: Side | null): string[] {
  if (file === 'Q' || file === 'K') {
    return [CENTRAL_FILES[file]];
  }
  return (side ? [side] : WINGS).map((wing) => WING_FILES[file][wing]);
}

// A Square can be genuinely ambiguous (no side given on a wing file), so this
// returns every algebraic square it could mean rather than picking one.
function algebraicSquares(square: Square, color: Color): string[] {
  const rank = algebraicRank(square.rank, color);
  return algebraicFiles(square.file, square.side).map((file) => `${file}${rank}`);
}

function wingOfFile(file: string): Side {
  return 'abcd'.includes(file) ? 'Q' : 'K';
}

function matchesOrigin(move: Move, origin: Origin, color: Color): boolean {
  switch (origin.kind) {
    case 'none':
      return true;
    case 'side':
      return wingOfFile(move.from[0]) === origin.side;
    case 'file':
      return algebraicFiles(origin.file, origin.side).includes(move.from[0]);
    case 'square':
      return algebraicSquares(origin.square, color).includes(move.from);
  }
}

function matchesTarget(move: Move, target: Target, color: Color): boolean {
  switch (target.kind) {
    case 'square':
      return algebraicSquares(target.square, color).includes(move.to);
    case 'captured-piece':
      return move.captured === toPieceSymbol(target.piece);
  }
}

function isCaptureLike(move: Move): boolean {
  return move.isCapture() || move.isEnPassant();
}

function matchesMove(move: Move, node: MoveNode, color: Color): boolean {
  if (node.type === 'castling') {
    if (node.side === 'K') return move.isKingsideCastle();
    if (node.side === 'Q') return move.isQueensideCastle();
    return move.isKingsideCastle() || move.isQueensideCastle();
  }

  return (
    move.piece === toPieceSymbol(node.piece) &&
    isCaptureLike(move) === node.capture &&
    (!node.suffixes.enPassant || move.isEnPassant()) &&
    (move.promotion ?? null) === (node.promotion ? toPieceSymbol(node.promotion) : null) &&
    matchesOrigin(move, node.origin, color) &&
    matchesTarget(move, node.target, color)
  );
}

export class DescriptiveNotationWrapper {
  chess: Chess;
  parser: Parser;

  constructor(chess: Chess, parser: Parser = new StandardParser()) {
    this.chess = chess;
    this.parser = parser;
  }

  /** Works out which legal move `notation` refers to, without playing it. */
  resolve(notation: string): Move {
    const node = this.parser.parse(notation);
    const color = this.chess.turn();
    const candidates = this.chess
      .moves({ verbose: true })
      .filter((move) => matchesMove(move, node, color));

    if (candidates.length === 0) {
      throw new Error(`No legal move matches "${notation}"`);
    }
    if (candidates.length > 1) {
      throw new Error(
        `"${notation}" is ambiguous between ${candidates.map((move) => move.san).join(', ')}`,
      );
    }
    return candidates[0];
  }

  /** Resolves `notation` and plays it on the wrapped position. */
  move(notation: string): Move {
    return this.chess.move(this.resolve(notation).san);
  }
}
