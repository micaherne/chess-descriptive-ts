import { describe, it, expect } from 'vitest';
import { StandardParser } from '../../src/parsers/StandardParser.js';
import type { Suffixes } from '../../src/parsers/MoveNode.js';

const NO_SUFFIXES: Suffixes = { check: null, enPassant: false, annotation: null };

describe('StandardParser#parse', () => {
  describe('piece moves without an origin', () => {
    it('parses a wing-file target with an explicit side', () => {
      expect(new StandardParser().parse('N-QB3')).toEqual({
        type: 'piece-move',
        piece: 'N',
        origin: { kind: 'none' },
        capture: false,
        target: { kind: 'square', square: { file: 'B', side: 'Q', rank: 3 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('normalizes the historical "Kt" knight abbreviation to "N"', () => {
      expect(new StandardParser().parse('Kt-KB3')).toEqual({
        type: 'piece-move',
        piece: 'N',
        origin: { kind: 'none' },
        capture: false,
        target: { kind: 'square', square: { file: 'B', side: 'K', rank: 3 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses a central-file target, which needs no side', () => {
      expect(new StandardParser().parse('P-K4')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'none' },
        capture: false,
        target: { kind: 'square', square: { file: 'K', side: null, rank: 4 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('leaves a wing-file target with no side as syntactically ambiguous', () => {
      expect(new StandardParser().parse('N-B3')).toEqual({
        type: 'piece-move',
        piece: 'N',
        origin: { kind: 'none' },
        capture: false,
        target: { kind: 'square', square: { file: 'B', side: null, rank: 3 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses the king as the moving piece', () => {
      expect(new StandardParser().parse('K-K2')).toEqual({
        type: 'piece-move',
        piece: 'K',
        origin: { kind: 'none' },
        capture: false,
        target: { kind: 'square', square: { file: 'K', side: null, rank: 2 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });
  });

  describe('origin disambiguators', () => {
    it('parses a side letter fused to the piece', () => {
      expect(new StandardParser().parse('KN-Q5')).toEqual({
        type: 'piece-move',
        piece: 'N',
        origin: { kind: 'side', side: 'K' },
        capture: false,
        target: { kind: 'square', square: { file: 'Q', side: null, rank: 5 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses an explicit origin square in parentheses, and a trailing check suffix', () => {
      expect(new StandardParser().parse('N(K5)-QB3 check')).toEqual({
        type: 'piece-move',
        piece: 'N',
        origin: { kind: 'square', square: { file: 'K', side: null, rank: 5 } },
        capture: false,
        target: { kind: 'square', square: { file: 'B', side: 'Q', rank: 3 } },
        promotion: null,
        suffixes: { check: 'check', enPassant: false, annotation: null },
      });
    });

    it('parses an explicit origin square in slash form, trailing the target', () => {
      expect(new StandardParser().parse('BxN/QB6')).toEqual({
        type: 'piece-move',
        piece: 'B',
        origin: { kind: 'square', square: { file: 'B', side: 'Q', rank: 6 } },
        capture: true,
        target: { kind: 'captured-piece', piece: 'N' },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses a pawn origin disambiguated by file and side', () => {
      expect(new StandardParser().parse('QBPxP')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'file', side: 'Q', file: 'B' },
        capture: true,
        target: { kind: 'captured-piece', piece: 'P' },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });
  });

  describe('captures', () => {
    it('parses a capture whose target is a square', () => {
      expect(new StandardParser().parse('PxQB4')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'none' },
        capture: true,
        target: { kind: 'square', square: { file: 'B', side: 'Q', rank: 4 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses a capture whose target is the identity of the captured piece', () => {
      expect(new StandardParser().parse('QxN')).toEqual({
        type: 'piece-move',
        piece: 'Q',
        origin: { kind: 'none' },
        capture: true,
        target: { kind: 'captured-piece', piece: 'N' },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses an en passant capture', () => {
      expect(new StandardParser().parse('PxP e.p.')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'none' },
        capture: true,
        target: { kind: 'captured-piece', piece: 'P' },
        promotion: null,
        suffixes: { check: null, enPassant: true, annotation: null },
      });
    });

    it('accepts the "×" character as equivalent to "x"', () => {
      expect(new StandardParser().parse('Q×N')).toEqual({
        type: 'piece-move',
        piece: 'Q',
        origin: { kind: 'none' },
        capture: true,
        target: { kind: 'captured-piece', piece: 'N' },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses a capture that also promotes', () => {
      expect(new StandardParser().parse('PxQ8=Q')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'none' },
        capture: true,
        target: { kind: 'square', square: { file: 'Q', side: null, rank: 8 } },
        promotion: 'Q',
        suffixes: NO_SUFFIXES,
      });
    });
  });

  describe('promotion', () => {
    it('parses the parenthesized promotion form', () => {
      expect(new StandardParser().parse('P-K8(Q)')).toMatchObject({
        target: { kind: 'square', square: { file: 'K', side: null, rank: 8 } },
        promotion: 'Q',
      });
    });

    it('parses the "=" promotion form', () => {
      expect(new StandardParser().parse('P-K8=Q')).toMatchObject({
        target: { kind: 'square', square: { file: 'K', side: null, rank: 8 } },
        promotion: 'Q',
      });
    });

    it('parses the "/" promotion form', () => {
      expect(new StandardParser().parse('P-K8/Q')).toMatchObject({
        target: { kind: 'square', square: { file: 'K', side: null, rank: 8 } },
        promotion: 'Q',
      });
    });

    it('parses underpromotion to a piece other than the queen', () => {
      expect(new StandardParser().parse('P-K8(N)')).toMatchObject({
        target: { kind: 'square', square: { file: 'K', side: null, rank: 8 } },
        promotion: 'N',
      });
    });
  });

  describe('rank omission', () => {
    it('treats an omitted rank as rank 1', () => {
      expect(new StandardParser().parse('R-K')).toMatchObject({
        target: { kind: 'square', square: { file: 'K', side: null, rank: 1 } },
      });
    });

    it('treats the "sq." form as equivalent to an omitted rank', () => {
      expect(new StandardParser().parse('R-Ksq.')).toMatchObject({
        target: { kind: 'square', square: { file: 'K', side: null, rank: 1 } },
      });
    });

    it('treats "sq" without a trailing period the same way', () => {
      expect(new StandardParser().parse('R-Ksq')).toMatchObject({
        target: { kind: 'square', square: { file: 'K', side: null, rank: 1 } },
      });
    });
  });

  describe('castling', () => {
    it('parses "O-O" as kingside', () => {
      expect(new StandardParser().parse('O-O')).toEqual({
        type: 'castling',
        side: 'K',
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses "O-O-O" as queenside', () => {
      expect(new StandardParser().parse('O-O-O')).toEqual({
        type: 'castling',
        side: 'Q',
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses bare "Castles" as side-unspecified', () => {
      expect(new StandardParser().parse('Castles')).toEqual({
        type: 'castling',
        side: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses "Castles K" and "Castles Q" with an explicit side', () => {
      expect(new StandardParser().parse('Castles K')).toEqual({
        type: 'castling',
        side: 'K',
        suffixes: NO_SUFFIXES,
      });
      expect(new StandardParser().parse('Castles Q')).toEqual({
        type: 'castling',
        side: 'Q',
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses "Castles (King)" and "Castles (Queen)" with an explicit side', () => {
      expect(new StandardParser().parse('Castles (King)')).toEqual({
        type: 'castling',
        side: 'K',
        suffixes: NO_SUFFIXES,
      });
      expect(new StandardParser().parse('Castles (Queen)')).toEqual({
        type: 'castling',
        side: 'Q',
        suffixes: NO_SUFFIXES,
      });
    });

    it('parses a check suffix on a castling move', () => {
      expect(new StandardParser().parse('O-O ch')).toEqual({
        type: 'castling',
        side: 'K',
        suffixes: { check: 'check', enPassant: false, annotation: null },
      });
    });
  });

  describe('suffixes', () => {
    it.each([
      ['N-QB3+', 'check'],
      ['N-QB3 ch', 'check'],
      ['N-QB3 check', 'check'],
      ['N-QB3 mate', 'checkmate'],
      ['N-QB3++', 'checkmate'],
      ['N-QB3 checkmate', 'checkmate'],
    ])('parses %s as check: %s', (notation, check) => {
      expect(new StandardParser().parse(notation)).toMatchObject({ suffixes: { check } });
    });

    it.each([['N-QB3!'], ['N-QB3?'], ['N-QB3!!'], ['N-QB3??'], ['N-QB3!?'], ['N-QB3?!']])(
      'parses the annotation mark in %s',
      (notation) => {
        const annotation = notation.slice('N-QB3'.length);
        expect(new StandardParser().parse(notation)).toMatchObject({ suffixes: { annotation } });
      },
    );

    it('combines a check mark with an en passant marker', () => {
      expect(new StandardParser().parse('PxP e.p.+')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'none' },
        capture: true,
        target: { kind: 'captured-piece', piece: 'P' },
        promotion: null,
        suffixes: { check: 'check', enPassant: true, annotation: null },
      });
    });
  });

  describe('periods are insignificant everywhere', () => {
    it('ignores a trailing period on the "Kt" abbreviation', () => {
      expect(new StandardParser().parse('Kt.-KB3')).toMatchObject({ piece: 'N' });
    });

    it('ignores a trailing period on a check mark', () => {
      expect(new StandardParser().parse('N-QB3 ch.')).toMatchObject({
        suffixes: { check: 'check' },
      });
    });

    it('treats "ep" and "e.p." identically', () => {
      expect(new StandardParser().parse('PxP ep')).toEqual(new StandardParser().parse('PxP e.p.'));
    });
  });

  describe('whitespace is insignificant everywhere', () => {
    it('treats spaces around the capture operator like no spaces at all', () => {
      expect(new StandardParser().parse('Kt x Kt')).toEqual(new StandardParser().parse('KtxKt'));
    });
  });

  describe('the "Kt" knight abbreviation is accepted everywhere "N" is', () => {
    it('as a file in a target square', () => {
      expect(new StandardParser().parse('P-KKt4')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'none' },
        capture: false,
        target: { kind: 'square', square: { file: 'N', side: 'K', rank: 4 } },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('as a bare captured-piece target', () => {
      expect(new StandardParser().parse('QxKt')).toEqual(new StandardParser().parse('QxN'));
    });

    it('as a fused pawn-origin file', () => {
      expect(new StandardParser().parse('QKtPxP')).toEqual({
        type: 'piece-move',
        piece: 'P',
        origin: { kind: 'file', side: 'Q', file: 'N' },
        capture: true,
        target: { kind: 'captured-piece', piece: 'P' },
        promotion: null,
        suffixes: NO_SUFFIXES,
      });
    });

    it('as a promotion piece', () => {
      expect(new StandardParser().parse('P-K8(Kt)')).toEqual(new StandardParser().parse('P-K8(N)'));
    });
  });

  describe('invalid notation', () => {
    it.each([[''], ['not a move'], ['N-Z9']])('throws on %s', (notation) => {
      expect(() => new StandardParser().parse(notation)).toThrow();
    });
  });
});
