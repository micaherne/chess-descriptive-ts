import { Parser } from './Parser.js';
import type {
  CentralFile,
  MoveNode,
  Origin,
  PieceLetter,
  Side,
  Square,
  Suffixes,
  Target,
  WingFile,
} from './MoveNode.js';

// "Kt" is the historical abbreviation for the knight, accepted everywhere
// "N" is: as a piece letter, a file letter, a captured-piece identity, and a
// promotion piece.
function knightAlias(raw: string): string {
  return raw === 'Kt' ? 'N' : raw;
}

const CHECK_MARKS: Record<string, Suffixes['check']> = {
  ch: 'check',
  check: 'check',
  '+': 'check',
  mate: 'checkmate',
  checkmate: 'checkmate',
  '++': 'checkmate',
};

const ANNOTATIONS = new Set(['!', '?', '!!', '??', '!?', '?!']);

const PROMOTION_PIECE = /^(?:Kt|([QRBN]))$/;
type PromotionPiece = 'Q' | 'R' | 'B' | 'N';

function parsePromotionPiece(raw: string): PromotionPiece {
  if (!PROMOTION_PIECE.test(raw)) {
    throw new SyntaxError(`Invalid promotion piece: "${raw}"`);
  }
  return knightAlias(raw) as PromotionPiece;
}

// Anchored to the end of the string; tried leftmost-first, so e.g. "++" is
// preferred over "+" and "checkmate" over "check" whenever both would fit.
const TRAILING_SUFFIX = /(checkmate|check|mate|ch|ep|\+\+|\+|!!|\?\?|!\?|\?!|!|\?)$/;

const SQUARE = /^(?:([KQ]))?(Kt|[RNBQK])(?:(\d)|sq)?$/;

const CASTLING = /^(O-O-O|O-O|Castles)(K|Q|\(King\)|\(Queen\))?$/;

// See GRAMMAR.md for what each group means; named groups mirror the EBNF
// production names directly.
const PIECE_MOVE = new RegExp(
  '^' +
    '(?:(?<fusedSide>K|Q)(?<fusedFile>Kt|R|N|B)?)?' + // FusedOrigin
    '(?<piece>Kt|K|Q|R|B|N|P)' + // Piece
    '(?:\\((?<originSquare>[^()]+)\\))?' + // "(" Square ")"
    '(?<moveOp>-|x|×)' + // MoveOp
    '(?<target>[^/()=]+)' + // Target
    '(?:/(?<slashTail>[^/()=]+))?' + // "/" SlashTail
    '(?:\\((?<promoParen>Kt|[QRBN])\\)|=(?<promoEq>Kt|[QRBN]))?' + // Promotion
    '$',
);

// Periods and whitespace are both insignificant throughout this dialect —
// stripped up front rather than tolerated piecemeal in each production.
function normalize(notation: string): string {
  return notation.replace(/[.\s]/g, '');
}

function extractSuffixes(input: string): { core: string; suffixes: Suffixes } {
  const suffixes: Suffixes = { check: null, enPassant: false, annotation: null };
  let core = input;
  let match: RegExpExecArray | null;
  while ((match = TRAILING_SUFFIX.exec(core))) {
    const token = match[1];
    core = core.slice(0, match.index);
    if (token === 'ep') {
      suffixes.enPassant = true;
    } else if (token in CHECK_MARKS) {
      suffixes.check = CHECK_MARKS[token];
    } else if (ANNOTATIONS.has(token)) {
      suffixes.annotation = token as Suffixes['annotation'];
    }
  }
  return { core, suffixes };
}

function parseSquare(raw: string): Square {
  const match = SQUARE.exec(raw);
  if (!match) {
    throw new SyntaxError(`Invalid square: "${raw}"`);
  }
  const [, side, file, rank] = match;
  return {
    file: knightAlias(file) as CentralFile | WingFile,
    side: (side as Side | undefined) ?? null,
    rank: rank ? Number(rank) : 1,
  };
}

function normalizePiece(raw: string): PieceLetter {
  return knightAlias(raw) as PieceLetter;
}

function parseOrigin(
  fusedSide: string | undefined,
  fusedFile: string | undefined,
  originSquare: string | undefined,
  slashTail: string | undefined,
  piece: PieceLetter,
): Origin {
  if (originSquare) {
    return { kind: 'square', square: parseSquare(originSquare) };
  }
  if (fusedSide) {
    return fusedFile
      ? { kind: 'file', side: fusedSide as Side, file: knightAlias(fusedFile) as WingFile }
      : { kind: 'side', side: fusedSide as Side };
  }
  if (slashTail && piece !== 'P') {
    return { kind: 'square', square: parseSquare(slashTail) };
  }
  return { kind: 'none' };
}

function parseTarget(raw: string, capture: boolean): Target {
  if (capture && /^(?:Kt|[KQRBNP])$/.test(raw)) {
    return { kind: 'captured-piece', piece: knightAlias(raw) as PieceLetter };
  }
  return { kind: 'square', square: parseSquare(raw) };
}

function parsePromotion(
  piece: PieceLetter,
  promoParen: string | undefined,
  promoEq: string | undefined,
  slashTail: string | undefined,
): PromotionPiece | null {
  if (promoParen) return parsePromotionPiece(promoParen);
  if (promoEq) return parsePromotionPiece(promoEq);
  if (slashTail && piece === 'P') return parsePromotionPiece(slashTail);
  return null;
}

function parseCastlingSide(symbol: string, qualifier?: string): Side | null {
  if (symbol === 'O-O') return 'K';
  if (symbol === 'O-O-O') return 'Q';
  if (qualifier === 'K' || qualifier === '(King)') return 'K';
  if (qualifier === 'Q' || qualifier === '(Queen)') return 'Q';
  return null;
}

export class StandardParser extends Parser {
  parse(notation: string): MoveNode {
    const { core, suffixes } = extractSuffixes(normalize(notation));

    const castling = CASTLING.exec(core);
    if (castling) {
      const [, symbol, qualifier] = castling;
      return { type: 'castling', side: parseCastlingSide(symbol, qualifier), suffixes };
    }

    const move = PIECE_MOVE.exec(core);
    if (!move || !move.groups) {
      throw new SyntaxError(`Invalid descriptive notation: "${notation}"`);
    }

    const { fusedSide, fusedFile, piece: rawPiece, originSquare, moveOp, target, slashTail, promoParen, promoEq } =
      move.groups;

    const piece = normalizePiece(rawPiece);
    const capture = moveOp !== '-';

    return {
      type: 'piece-move',
      piece,
      origin: parseOrigin(fusedSide, fusedFile, originSquare, slashTail, piece),
      capture,
      target: parseTarget(target, capture),
      promotion: parsePromotion(piece, promoParen, promoEq, slashTail),
      suffixes,
    };
  }
}
