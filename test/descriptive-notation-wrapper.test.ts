import { describe, it, expect } from 'vitest';
import { Chess, WHITE, PAWN, KNIGHT } from 'chess.js';
import { DescriptiveNotationWrapper } from '../src/DescriptiveNotationWrapper.js';
import { Parser } from '../src/parsers/Parser.js';
import { StandardParser } from '../src/parsers/StandardParser.js';
import type { MoveNode } from '../src/parsers/MoveNode.js';

class FixedParser extends Parser {
  constructor(private readonly node: MoveNode) {
    super();
  }

  parse(): MoveNode {
    return this.node;
  }
}

describe('DescriptiveNotationWrapper', () => {
  it('stores the Chess instance it is constructed with', () => {
    const chess = new Chess();
    const wrapper = new DescriptiveNotationWrapper(chess);
    expect(wrapper.chess).toBe(chess);
  });

  it('defaults to a StandardParser when none is given', () => {
    const wrapper = new DescriptiveNotationWrapper(new Chess());
    expect(wrapper.parser).toBeInstanceOf(StandardParser);
  });

  it('uses an injected parser instead of the default', () => {
    const node: MoveNode = {
      type: 'piece-move',
      piece: 'P',
      origin: { kind: 'none' },
      capture: false,
      target: { kind: 'square', square: { file: 'K', side: null, rank: 4 } },
      promotion: null,
      suffixes: { check: null, enPassant: false, annotation: null },
    };
    const wrapper = new DescriptiveNotationWrapper(new Chess(), new FixedParser(node));
    expect(wrapper.resolve('this text is ignored by FixedParser').san).toBe('e4');
  });
});

describe('DescriptiveNotationWrapper#resolve', () => {
  it('resolves \'Kt-KB3\' as Nf3 from the starting position', () => {
    const wrapper = new DescriptiveNotationWrapper(new Chess());
    expect(wrapper.resolve('Kt-KB3')).toMatchObject({
      color: WHITE,
      from: 'g1',
      to: 'f3',
      piece: KNIGHT,
      san: 'Nf3',
    });
  });

  it('resolves \'P-K4\' as e4 from the starting position', () => {
    const wrapper = new DescriptiveNotationWrapper(new Chess());
    expect(wrapper.resolve('P-K4')).toMatchObject({
      color: WHITE,
      from: 'e2',
      to: 'e4',
      piece: PAWN,
      san: 'e4',
    });
  });

  it('resolves \'N-QR3\' as Na3 from the starting position', () => {
    const wrapper = new DescriptiveNotationWrapper(new Chess());
    expect(wrapper.resolve('N-QR3')).toMatchObject({
      color: WHITE,
      from: 'b1',
      to: 'a3',
      piece: KNIGHT,
      san: 'Na3',
    });
  });

  it('does not change the position', () => {
    const chess = new Chess();
    const fenBefore = chess.fen();
    new DescriptiveNotationWrapper(chess).resolve('P-K4');
    expect(chess.fen()).toBe(fenBefore);
  });

  describe('disambiguation', () => {
    it('throws when the target wing is unspecified and both knights could reach it', () => {
      const wrapper = new DescriptiveNotationWrapper(new Chess());
      expect(() => wrapper.resolve('N-B3')).toThrow('ambiguous');
    });

    it('resolves the same target once a side is fused to the piece', () => {
      const wrapper = new DescriptiveNotationWrapper(new Chess());
      expect(wrapper.resolve('QN-B3').san).toBe('Nc3');
      expect(wrapper.resolve('KN-B3').san).toBe('Nf3');
    });

    it('resolves via an explicit origin square when side alone would not disambiguate', () => {
      // Two queens (as after a promotion) can both reach d5, but neither is
      // "the queenside/kingside queen" in any meaningful sense - only an
      // explicit origin square can tell them apart.
      const fen = '4k3/8/8/8/8/8/8/3QK2Q w - - 0 1';
      const wrapper = new DescriptiveNotationWrapper(new Chess(fen));
      expect(() => wrapper.resolve('Q-Q5')).toThrow('ambiguous');
      expect(wrapper.resolve('Q(Q1)-Q5').san).toBe('Qdd5');
      expect(wrapper.resolve('Q(KR1)-Q5').san).toBe('Qhd5');
    });

    it('treats "side" as relative to the other candidate(s), not a fixed half of the board', () => {
      // Knights on e4 and f3 are both on the "kingside half" absolutely, but
      // QKt should mean the more-queenside of the two (e4), KKt the other.
      const fen = '4k3/8/8/8/4N3/5N2/8/7K w - - 0 1';
      const wrapper = new DescriptiveNotationWrapper(new Chess(fen));
      expect(wrapper.resolve('QKt-Q2').from).toBe('e4');
      expect(wrapper.resolve('KKt-Q2').from).toBe('f3');
    });

    it('treats "side" as a no-op when only one candidate exists', () => {
      const fen = '4k3/8/8/8/4N3/8/8/7K w - - 0 1';
      const wrapper = new DescriptiveNotationWrapper(new Chess(fen));
      expect(wrapper.resolve('QKt-Q2').from).toBe('e4');
      expect(wrapper.resolve('KKt-Q2').from).toBe('e4');
    });

    it('with three candidates, "side" picks the extreme file, never the middle one', () => {
      const fen = '7k/8/8/8/1N1N4/8/8/N6K w - - 0 1'; // knights on a1, b4, d4
      const wrapper = new DescriptiveNotationWrapper(new Chess(fen));
      expect(wrapper.resolve('QKt-QB2').from).toBe('a1');
      expect(wrapper.resolve('KKt-QB2').from).toBe('d4');
    });
  });

  describe('castling', () => {
    it('resolves "O-O" and "O-O-O" from the starting position after clearing the way', () => {
      const wrapper = new DescriptiveNotationWrapper(
        new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),
      );
      expect(wrapper.resolve('O-O').san).toBe('O-O');
      expect(wrapper.resolve('O-O-O').san).toBe('O-O-O');
    });

    it('resolves bare "Castles" when only one side is legal', () => {
      const wrapper = new DescriptiveNotationWrapper(new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1'));
      expect(wrapper.resolve('Castles').san).toBe('O-O');
    });

    it('throws when castling is illegal', () => {
      const wrapper = new DescriptiveNotationWrapper(new Chess());
      expect(() => wrapper.resolve('O-O')).toThrow('No legal move');
    });
  });

  describe('captures', () => {
    it('resolves a capture named by the captured piece', () => {
      const wrapper = new DescriptiveNotationWrapper(new Chess('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1'));
      expect(wrapper.resolve('QxN').san).toBe('Qxd5');
    });

    it('resolves an en passant capture with or without the "e.p." suffix', () => {
      const fen = 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2';
      const wrapper = new DescriptiveNotationWrapper(new Chess(fen));
      expect(wrapper.resolve('PxP e.p.').san).toBe('dxe3');
      expect(wrapper.resolve('PxP').san).toBe('dxe3');
    });
  });

  describe('promotion', () => {
    it('resolves a promoting move to the requested piece', () => {
      const wrapper = new DescriptiveNotationWrapper(new Chess('8/3P3k/8/8/8/8/7K/8 w - - 0 1'));
      const move = wrapper.resolve('P-Q8(Q)');
      expect(move.san).toBe('d8=Q');
      expect(move.promotion).toBe('q');
    });
  });

  it('throws when no legal move matches', () => {
    const wrapper = new DescriptiveNotationWrapper(new Chess());
    expect(() => wrapper.resolve('Q-K4')).toThrow('No legal move');
  });
});

describe('DescriptiveNotationWrapper#move', () => {
  it('plays the resolved move on the wrapped position', () => {
    const chess = new Chess();
    const wrapper = new DescriptiveNotationWrapper(chess);
    const move = wrapper.move('P-K4');
    expect(move.san).toBe('e4');
    expect(chess.history()).toEqual(['e4']);
    expect(chess.turn()).toBe('b');
  });

  it('leaves the position unchanged when the move cannot be resolved', () => {
    const chess = new Chess();
    const fenBefore = chess.fen();
    const wrapper = new DescriptiveNotationWrapper(chess);
    expect(() => wrapper.move('Q-K4')).toThrow('No legal move');
    expect(chess.fen()).toBe(fenBefore);
  });
});
