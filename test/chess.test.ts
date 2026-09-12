import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';

describe('chess.js', () => {
  it('starts a new game with the standard starting position', () => {
    const chess = new Chess();
    expect(chess.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});
