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

// A run of dots and/or whitespace, always optional - the "filler" (hence
// GAP: the gap between two adjacent tokens where it's allowed to appear) in
// this dialect. Historical notation sprinkles periods after abbreviations
// and spaces around symbols fairly arbitrarily (e.g. "K.Kt.-B.5"), and
// neither ever changes the meaning. This deliberately does NOT split a
// multi-letter token in two - "Kt", "sq", "checkmate" etc. stay intact -
// except "ep" below, which represents "e.p.": two separately-abbreviated
// letters, not one word, so it gets a GAP between the "e" and the "p" too.
const GAP = '[.\\s]*';

// A single optional trailing dot - narrower than GAP (no whitespace) - for
// the "an abbreviated word/letter can take its own trailing dot" case (e.g.
// the "Kt." in "BxKt.", or "Castles."), used at points where a bare GAP
// would risk swallowing adjacent whitespace that isn't part of the notation
// at all (see SQUARE_SHAPE below).
const DOT = '\\.?';

// Shared letter sets, so the precise shape of a square/file/promotion piece
// is defined exactly once and reused everywhere it's needed, rather than
// risking two copies drifting apart.
const SIDE_LETTERS = '[KQ]';
const WING_FILE_LETTERS = 'Kt|R|N|B';
const FILE_LETTERS = `Kt|[RNBQK]`;
const PROMOTION_PIECE_LETTERS = 'Kt|[QRBN]';
// Case-insensitive spelled out per-letter rather than an `i` flag, since an
// `i` flag would also case-fold the piece/file letters elsewhere in the same
// pattern, which should stay case-sensitive.
const SQ = '[sS][qQ]';

// "-" (ASCII hyphen) plus en dash/em dash, all meaning "to"; "x"/"X"/"×" all
// meaning "takes". CAPTURE_OPS is also used at the one place that has to
// tell the two apart (deciding `capture` in `parse()` below).
const NON_CAPTURE_OPS = '-|–|—';
const CAPTURE_OPS = 'x|X|×';
const CAPTURE_OP_SET = new Set(['x', 'X', '×']);

// The full shape of a Square (side, file, rank-or-"sq", all optional except
// the file), unanchored and with no capturing groups of its own — used to
// bound `target`/`originSquare`/`slashTail` in PIECE_MOVE below so they can
// only ever match an actual square (plus filler), not an unbounded run of
// characters. GAP only ever matches dots/whitespace, so this stays just as
// bounded as before even with filler woven through it. The trailing DOT
// (not a full GAP) covers a dot right after the file/"sq" itself - "Kt." as
// a bare captured-piece target, or "sq." - without risking an unbounded GAP
// swallowing adjacent whitespace that isn't part of the square at all when
// this pattern is reused for scanning surrounding text.
const SQUARE_SHAPE = `(?:(?:${SIDE_LETTERS})${GAP})?(?:${FILE_LETTERS})(?:${GAP}(?:\\d|${SQ}))?${DOT}`;

// Trailing DOT (not the exact-match check this used to be) because a
// promotion piece reached via `slashTail` may come through SQUARE_SHAPE
// (which itself tolerates a trailing dot, e.g. "P-K8/Kt.") rather than as a
// bare letter - the dot needs stripping here, not just tolerating.
const PROMOTION_PIECE = new RegExp(`^(${PROMOTION_PIECE_LETTERS})${DOT}$`);
type PromotionPiece = 'Q' | 'R' | 'B' | 'N';

function parsePromotionPiece(raw: string): PromotionPiece {
  const match = PROMOTION_PIECE.exec(raw);
  if (!match) {
    throw new SyntaxError(`Invalid promotion piece: "${raw}"`);
  }
  return knightAlias(match[1]) as PromotionPiece;
}

// Anchored to the end of the string; tried leftmost-first, so e.g. "++" is
// preferred over "+" and "checkmate" over "check" whenever both would fit.
// "ep" (standing for "e.p.") is the one token split into two letters with a
// GAP between them - see the GAP comment above.
const TRAILING_SUFFIX = new RegExp(
  `${GAP}(checkmate|check|mate|ch|e${GAP}p|\\+\\+|\\+|!!|\\?\\?|!\\?|\\?!|!|\\?)${GAP}$`,
);

const SQUARE = new RegExp(`^(?:(${SIDE_LETTERS})${GAP})?(${FILE_LETTERS})(?:${GAP}(?:(\\d)|${SQ}))?${DOT}$`);

// Exported so other tools can build their own RegExp from the exact same
// definition (e.g. unanchored, or embedded in a larger pattern) instead of
// re-deriving it and risking drift as this grammar evolves. Anchored below
// for this module's own use; callers add whatever delimiters they need.
// No leading/trailing GAP here: that's padding *around* the move, not
// *within* it, and would mean a match against surrounding text swallows
// adjacent whitespace it doesn't own.
// Distinct groups per semantic value (never one group spanning filler/parens
// itself) so parseCastlingSide can check presence/exact-equality safely,
// the same reasoning as the "captured piece"/"promotion piece" fixes above:
// a group that captures a word *plus* the filler around it can no longer be
// compared to the bare word.
export const CASTLING_PATTERN =
  `(?:(O${GAP}-${GAP}O)(${GAP}-${GAP}O)?|(Castles))${DOT}` +
  `(?:${GAP}(?:(K|Q)|\\(${GAP}(King|Queen)${GAP}\\))${DOT})?`;

// See GRAMMAR.md for what each group means; named groups mirror the EBNF
// production names directly.
export const PIECE_MOVE_PATTERN =
  `(?:(?<fusedSide>${SIDE_LETTERS})(?:${GAP}(?<fusedFile>${WING_FILE_LETTERS}))?${GAP})?` + // FusedOrigin
  '(?<piece>Kt|K|Q|R|B|N|P)' + // Piece
  `(?:${GAP}\\(${GAP}(?<originSquare>${SQUARE_SHAPE})\\))?` + // "(" Square ")"
  `${GAP}(?<moveOp>${NON_CAPTURE_OPS}|${CAPTURE_OPS})${GAP}` + // MoveOp
  `(?<target>${SQUARE_SHAPE}|P)` + // Target: a Square, or bare "P" ("P" isn't a file)
  `(?:${GAP}/${GAP}(?<slashTail>${SQUARE_SHAPE}|${PROMOTION_PIECE_LETTERS}))?` + // "/" SlashTail
  `(?:${GAP}\\(${GAP}(?<promoParen>${PROMOTION_PIECE_LETTERS})${GAP}\\)|` +
  `${GAP}=${GAP}(?<promoEq>${PROMOTION_PIECE_LETTERS})${DOT})?`; // Promotion

const CASTLING = new RegExp(`^${CASTLING_PATTERN}$`);
const PIECE_MOVE = new RegExp(`^${PIECE_MOVE_PATTERN}$`);

function extractSuffixes(input: string): { core: string; suffixes: Suffixes } {
  const suffixes: Suffixes = { check: null, enPassant: false, annotation: null };
  let core = input;
  let match: RegExpExecArray | null;
  while ((match = TRAILING_SUFFIX.exec(core))) {
    const token = match[1];
    core = core.slice(0, match.index);
    if (token.startsWith('e')) {
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

const CAPTURED_PIECE = new RegExp(`^(Kt|[KQRBNP])${DOT}$`);

function parseTarget(raw: string, capture: boolean): Target {
  const capturedPiece = capture ? CAPTURED_PIECE.exec(raw) : null;
  if (capturedPiece) {
    return { kind: 'captured-piece', piece: knightAlias(capturedPiece[1]) as PieceLetter };
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

function parseCastlingSide(
  ooBase: string | undefined,
  ooExtra: string | undefined,
  bareQualifier: string | undefined,
  wordQualifier: string | undefined,
): Side | null {
  if (ooBase) return ooExtra ? 'Q' : 'K';
  if (bareQualifier === 'K' || wordQualifier === 'King') return 'K';
  if (bareQualifier === 'Q' || wordQualifier === 'Queen') return 'Q';
  return null;
}

export class StandardParser extends Parser {
  parse(notation: string): MoveNode {
    const { core, suffixes } = extractSuffixes(notation);

    const castling = CASTLING.exec(core);
    if (castling) {
      const [, ooBase, ooExtra, , bareQualifier, wordQualifier] = castling;
      const side = parseCastlingSide(ooBase, ooExtra, bareQualifier, wordQualifier);
      return { type: 'castling', side, suffixes };
    }

    const move = PIECE_MOVE.exec(core);
    if (!move || !move.groups) {
      throw new SyntaxError(`Invalid descriptive notation: "${notation}"`);
    }

    const { fusedSide, fusedFile, piece: rawPiece, originSquare, moveOp, target, slashTail, promoParen, promoEq } =
      move.groups;

    const piece = normalizePiece(rawPiece);
    const capture = CAPTURE_OP_SET.has(moveOp);

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
