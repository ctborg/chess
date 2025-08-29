// src/ai/engine.js
// Tiny chess AI using chess.js for rules + a simple alpha-beta search.
// Exports: computeBestMove(fen, { depth, randomness })

import { Chess } from "chess.js";

// Piece values (centipawns)
const PV = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Simple evaluation: material + mobility (side-to-move gets slight bonus for options)
function evaluate(chess) {
  // Terminal checks first
  if (chess.isCheckmate()) {
    // Side to move has no moves and is in check -> lost
    // Score from White's perspective
    return chess.turn() === "w" ? -Infinity : Infinity;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial()) {
    return 0;
  }

  let score = 0;

  // Material
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const v = PV[piece.type];
      score += piece.color === "w" ? v : -v;
    }
  }

  // Mobility (encourage piece activity)
  const wMoves = chess.moves({ verbose: true, legal: true, turn: "w" }).length || 1;
  const bMoves = chess.moves({ verbose: true, legal: true, turn: "b" }).length || 1;
  score += 0.05 * (wMoves - bMoves); // light touch

  // Small center control bonus (very rough)
  const centers = new Set(["d4","e4","d5","e5"]);
  for (const sq of centers) {
    const p = chess.get(sq);
    if (!p) continue;
    score += p.color === "w" ? 6 : -6;
  }

  return score;
}

// Move ordering: prefer captures, then others
function orderMoves(moves) {
  return moves.sort((a, b) => {
    const ca = a.flags && a.flags.includes("c");
    const cb = b.flags && b.flags.includes("c");
    if (ca && !cb) return -1;
    if (cb && !ca) return 1;
    // promotions slightly earlier
    const pa = a.promotion ? 1 : 0;
    const pb = b.promotion ? 1 : 0;
    return pb - pa;
  });
}

// Alpha-beta search, returns [bestScore, bestMove]
function search(chess, depth, alpha, beta, maximizer) {
  // Terminal or depth 0
  if (depth === 0 || chess.isGameOver()) {
    return [evaluate(chess), null];
  }

  const moves = orderMoves(chess.moves({ verbose: true }));

  if (moves.length === 0) {
    // No legal moves: either stalemate or checkmate handled by evaluate
    return [evaluate(chess), null];
  }

  let bestMove = null;

  if (maximizer) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(normalizePromotion(m));
      const [score] = search(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (score > best) {
        best = score;
        bestMove = m;
      }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break; // beta cut
    }
    return [best, bestMove];
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(normalizePromotion(m));
      const [score] = search(chess, depth - 1, alpha, beta, true);
      chess.undo();
      if (score < best) {
        best = score;
        bestMove = m;
      }
      beta = Math.min(beta, best);
      if (beta <= alpha) break; // alpha cut
    }
    return [best, bestMove];
  }
}

// Ensure a promotion piece is set (default to queen)
function normalizePromotion(move) {
  if (move.promotion) return move;
  // chess.js verbose moves already include promotion when needed.
  // When we call with from/to, we may add it. Safe default:
  return move;
}

// Public API
export function computeBestMove(fen, { depth = 2, randomness = 0 } = {}) {
  const chess = new Chess(fen);

  // Generate legal moves now to handle very shallow “easy” mode randomization
  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) return null;

  // Randomness: with some probability, pick from the top-N moves instead of strict best
  // randomness in [0..1], e.g., 0.4 on Easy means 40% chance to pick a near-best move.
  const roll = Math.random();
  if (depth <= 1 && roll < randomness) {
    // random but weighted toward captures
    orderMoves(legal);
    // pick from the first 4 candidates if available
    const k = Math.min(4, legal.length);
    return legal[Math.floor(Math.random() * k)];
  }

  const sideToMove = chess.turn(); // 'w'|'b'
  const maximizer = sideToMove === "w";
  const [_, best] = search(chess, depth, -Infinity, Infinity, maximizer);
  return best || legal[0];
}
