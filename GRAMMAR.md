# Descriptive Notation Grammar

This document defines the canonical AST for a parsed descriptive-notation move,
and the concrete grammar for the default ("terse", e.g. `N-QB3`) dialect.

The AST is the contract between parsing and resolution: a **parser strategy**
is anything that takes a raw string and returns a `MoveNode` or throws a
syntax error. Board-aware resolution (turning a `MoveNode` plus a chess
position into an actual chess.js move, disambiguating and validating legality)
operates only on `MoveNode` and does not know which concrete dialect produced
it. Additional dialects (e.g. Staunton-style `P. to K's 4th`) are meant to be
separate grammars/parsers targeting this same AST, not variants of the terse
grammar below.

## Canonical AST

Pseudocode (not a specific implementation language):

```
MoveNode =
  | CastlingMove
  | PieceMove

CastlingMove = {
  type: 'castling',
  side: 'K' | 'Q' | null,       // null when the side isn't stated (e.g. bare "Castles")
  suffixes: Suffixes,
}

PieceMove = {
  type: 'piece-move',
  piece: 'K' | 'Q' | 'R' | 'B' | 'N' | 'P',
  origin: Origin,
  capture: boolean,
  target: Target,
  promotion: 'Q' | 'R' | 'B' | 'N' | null,
  suffixes: Suffixes,
}

Origin =
  | { kind: 'none' }
  | { kind: 'side', side: 'K' | 'Q' }        // fused to the piece letter, e.g. "KN-Q5"
  | { kind: 'square', square: Square }       // explicit origin, e.g. "N(K5)-QB3" or "B×N/QB6" —
                                              // same AST shape regardless of where the concrete
                                              // grammar places it (see below)
  | { kind: 'file', side: 'K' | 'Q' | null, file: WingFile }
                                              // pawn-only, e.g. the "QB" in "QBP×P" — side is
                                              // required in practice (a bare wing file doesn't
                                              // distinguish the two pawns), kept nullable only
                                              // for symmetry with Square

Target =
  | { kind: 'square', square: Square }       // e.g. "K4", "QB3"
  | { kind: 'captured-piece', piece: PieceLetter }  // e.g. the "N" in "Q×N" — square unknown
                                                     // until resolved against the position

Square = {
  file: CentralFile | WingFile,
  side: 'K' | 'Q' | null,   // required to disambiguate a WingFile; null/ignored for a CentralFile;
                             // also null when the text omits it (e.g. bare "B3") — that's a real
                             // syntactic ambiguity, left for the resolver to settle against the board
  rank: 1..8,               // an omitted rank (e.g. "R-K", "R-Ksq.") always means rank 1 —
                             // normalized by the parser, not left ambiguous for the resolver
}

CentralFile = 'Q' | 'K'
WingFile    = 'R' | 'N' | 'B'

Suffixes = {
  check: 'check' | 'checkmate' | null,
  enPassant: boolean,
  annotation: '!' | '?' | '!!' | '??' | '!?' | '?!' | null,
}
```

Notes:
- `Target`'s `captured-piece` variant exists because descriptive notation
  sometimes names the captured piece instead of the destination square
  (`Q×N`), so the parser cannot always produce a square — only the resolver,
  searching the position, can.
- A `Square` with `side: null` on a `WingFile` is not a parser error — `B3`
  alone is syntactically valid but semantically ambiguous (queen's bishop's 3
  vs king's bishop's 3) and must be resolved against the position.
- An omitted rank (`R-K`) or the explicit `sq` form (`R-Ksq`) always means
  rank 1 — this is a fixed textual meaning, not board-dependent, so the
  parser normalizes it rather than deferring to the resolver.
- A bare single-letter capture target that matches a piece letter (`Q×N`,
  `P×P`) is always the `captured-piece` variant, never a rank-omitted
  `Square` — `captured-piece` is only meaningful for a capture in the first
  place (a non-capture move's target is always a `Square`), and naming what
  was captured is how real notation actually uses a bare letter there. A
  richer target (anything with a rank digit, an explicit side, or `sq`) is
  always a `Square`.
- `Promotion` and `Origin`'s `square` variant both use a leading `/`
  (`P-K8/Q` vs `B×N/QB6`), which is genuinely ambiguous in isolation (a bare
  piece letter like `Q` also parses as a rank-omitted `Square`). This is
  resolved by piece type, not by guessing: promotion only exists for pawns
  and a pawn's origin is already fully determined by its file (see the
  `file`-kind `Origin` below), so a trailing `/X` is a promotion when
  `piece` is `P` and an origin square for every other piece.

## Tokenization

A run of dots and/or whitespace ("filler") is allowed **between any two
adjacent tokens** in the grammar below — not stripped as a preprocessing
step, but built directly into the pattern at each token boundary. Historical
descriptive notation sprinkles periods after abbreviations and spaces around
symbols fairly arbitrarily (`K.Kt.-B.5`, `Kt x Kt`, `Castles K`, `O - O`),
and neither ever changes the meaning.

Filler does **not** split a multi-letter token in two — `Kt`, `sq`,
`checkmate`, `Castles`, `King`, `Queen` all stay intact as single units, and
a trailing dot can follow any of these abbreviated words/letters (`Kt.`,
`sq.`, `Castles.`) without splitting them. The one deliberate exception is
`ep` (standing for `e.p.`): that really is two separately-abbreviated
letters, not one word, so filler is allowed between the `e` and the `p` too
(`e.p.`, `e. p.`, `ep` are all equivalent).

Filler is **not** allowed as padding around the outside of the whole move —
a leading/trailing run of dots or whitespace immediately before or after the
entire `Move` is not part of it. This matters for reuse: `PIECE_MOVE_PATTERN`
and `CASTLING_PATTERN`, exported from `StandardParser.ts` for use elsewhere
(e.g. scanning a larger document for move-shaped spans), only match the move
itself — they don't swallow adjacent whitespace they don't own. A caller
scanning free text can point either pattern directly at raw, undotted or
dotted text; no separate normalization step is needed or possible (there is
no `normalize()` function to reuse — the tolerance lives in the pattern).

`Kt` — the historical knight abbreviation — is accepted everywhere `N` is:
as `Piece`, as a `File` (`Q-Kt2`, `KKt4`, real squares are routinely named
with the knight's file spelled `Kt`, never `N`, in older sources), as the
bare captured-piece `Target`, and as a `Promotion` piece.

## Terse Dialect Grammar (EBNF)

```ebnf
Move           = CastlingMove | PieceMove ;

CastlingMove   = ( "O-O-O" | "O-O" | "Castles" ) , [ CastlingSide ] , [ Suffixes ] ;
CastlingSide   = "K" | "Q" | "(King)" | "(Queen)" ;

PieceMove      = [ FusedOrigin ] , Piece , [ "(" Square ")" ] , MoveOp , Target ,
                 [ "/" SlashTail ] , [ Promotion ] , [ Suffixes ] ;

Piece          = "K" | "Q" | "R" | "B" | "N" | "Kt" | "P" ;

(* Disambiguating the origin has two syntactic positions: fused before the
   piece letter (side alone for a rook/knight/bishop, or side+file for a
   pawn, since a pawn's file isn't implied by "P" the way a knight/bishop/
   rook's wing is implied by which piece letter follows), or an explicit
   square in parentheses right after the piece letter. Both the parenthesized
   form and the "/" form below produce the same Origin AST node
   (kind: 'square'). *)
FusedOrigin    = Side , [ WingFile ] ;   (* "KN" (rook/knight/bishop) or "QB" in "QBP" (pawn) *)

(* "/" SlashTail is ambiguous in isolation (see Notes above) — Promotion when
   the piece is "P", otherwise an explicit origin Square. *)
SlashTail      = Square | Piece ;

(* "-" = non-capture ("to"); "x"/"×" = capture ("takes"). En dash and em dash
   are accepted alongside the ASCII hyphen, and "X" alongside lowercase "x". *)
MoveOp         = "-" | "–" | "—" | "x" | "X" | "×" ;

(* A bare single letter matching Piece is the captured-piece identity when
   capturing (see Notes above); otherwise Target is a Square. *)
Target         = Square | Piece ;

Square         = [ Side ] , File , [ Rank | RankOmitted ] ;
Side           = "K" | "Q" ;
File           = "R" | "N" | "Kt" | "B" | "Q" | "K" ;   (* "Kt" is an alias for "N" *)
Rank           = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" ;
RankOmitted    = "sq" ;                  (* case-insensitive ("Sq", "SQ", ...); e.g. "R-K", "R-Ksq" — both mean rank 1 *)

(* The "/" Piece promotion form (e.g. "P-K8/Q") is realized through SlashTail
   above, not a third alternative here — by the time Promotion is reached,
   a leading "/" has already been consumed. *)
Promotion      = "(" Piece ")" | "=" Piece ;

Suffixes       = { Annotation | CheckMark | "ep" } ;
Annotation     = "!" | "?" | "!!" | "??" | "!?" | "?!" ;
CheckMark      = "ch" | "+" | "mate" | "++" | "check" | "checkmate" ;
```

Disambiguation (picking one legal move among several candidates matching an
`Origin`/`Target` pair) is deliberately not part of this grammar — it's a
semantic concern of the resolver, not a syntactic one. One resolver rule is
worth defining precisely here regardless, since it isn't obvious from the
syntax and got it wrong once already:

**`side` (in `Origin` and `FusedOrigin`, e.g. `QKt`, `KN`) is relative to the
other candidate piece(s) of the same type reaching the same target — it is
*not* a fixed half of the board.** `Q` means whichever candidate has the more
queenside (earlier) file; `K` means whichever has the more kingside (later)
file. So a knight sitting on the e-file can correctly be called `QKt` if the
only other knight able to make the move is further along on the f-file, even
though e is nominally "kingside" by a fixed a–d/e–h split. With three or more
candidates, `Q`/`K` still only pick the single most-extreme one — a middle
candidate can't be named this way at all and needs an explicit origin square
instead. With exactly one candidate, the side letter is a no-op (there's
nothing to disambiguate). A genuine tie (two candidates on the same file)
leaves more than one candidate and is reported as ambiguous, same as any
other unresolved case.

## Open Questions

- **Target disambiguator**: raised during design but no concrete example
  found yet beyond the `Origin` forms above (side-letter, explicit square,
  pawn file). May not exist as a distinct concept.
- **Staunton-style dialect** (`P. to K's 4th`, `Kt. to K B's 3rd`, `Castles
  on the King's side`, `P. takes Kt.`): looks mostly like a lexical variant
  of the terse dialect (different words/punctuation for the same structure)
  rather than a structurally different grammar, but not yet confirmed or
  specified.
- **Spanish/other-language variants** (piece letters `R D T C A P`, reversed
  file/rank order, no dash): out of scope for now.
