# chess-descriptive

A wrapper around [chess.js](https://github.com/jhlywa/chess.js) that lets you play moves in old-style English descriptive notation — `P-K4`, `Kt-KB3`, `O-O` — instead of algebraic (`e4`, `Nf3`, `O-O`). Useful if you're transcribing games from older chess books, which almost always use this notation.

## Usage

```ts
import { Chess } from 'chess.js';
import { DescriptiveNotationWrapper } from './src/DescriptiveNotationWrapper.js';

const game = new DescriptiveNotationWrapper(new Chess());

game.move('P-K4');     // plays e4
game.resolve('P-K4');  // same lookup, but returns the move without playing it
```

`resolve` and `move` both throw if the notation is invalid, illegal in the current position, or genuinely ambiguous (e.g. `N-B3` when either knight could reach a "B3" square — descriptive notation itself doesn't say which one).

## What's supported

The full grammar — disambiguation, captures, castling, promotion, en passant, check/annotation suffixes, and both `N` and the historical `Kt` for knights — is documented in [GRAMMAR.md](GRAMMAR.md).

## Status

Early stage: TypeScript source only, not published to npm. Only the "standard" terse dialect (`P-K4` style) is implemented; support for reading fully spelled-out notation (`P. to K's 4th`) is planned but not yet built.

## Development

```
npm test        # run tests
npm run typecheck
```
