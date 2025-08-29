import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board from "./components/Board.jsx";

export default function App() {
  // One Chess instance; server remains stateless — no persistence.
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [selected, setSelected] = useState(null);
  const [orientation, setOrientation] = useState("white"); // "white" | "black"
  const [pendingPromotion, setPendingPromotion] = useState(null); // {from,to} | null
  const [lastMove, setLastMove] = useState(null); // {from,to} for highlight

  const game = chessRef.current;

  const status = useMemo(() => {
    if (game.isCheckmate()) return "Checkmate";
    if (game.isStalemate()) return "Stalemate";
    if (game.isDraw()) return "Draw";
    if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} in check`;
    return `${game.turn() === "w" ? "White" : "Black"} to move`;
  }, [fen]); // recompute on fen change

  const legalTargets = useMemo(() => {
    if (!selected) return new Set();
    return new Set(
      game
        .moves({ square: selected, verbose: true })
        .map((m) => m.to)
    );
  }, [selected, fen]);

  function tryMove(from, to, promotion) {
    const move = game.move({ from, to, promotion });
    if (move) {
      setFen(game.fen());
      setSelected(null);
      setLastMove({ from, to });
      return true;
    }
    return false;
  }

  function handleSquareClick(square) {
    if (pendingPromotion) return; // wait for user to pick piece

    if (!selected) {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelected(square);
      }
      return;
    }

    if (square === selected) {
      setSelected(null);
      return;
    }

    // If the attempted move is a pawn promotion, show picker
    const piece = game.get(selected);
    const targetRank = Number(square[1]);
    const isPromo =
      piece &&
      piece.type === "p" &&
      ((piece.color === "w" && targetRank === 8) ||
        (piece.color === "b" && targetRank === 1));

    if (isPromo) {
      setPendingPromotion({ from: selected, to: square });
      return;
    }

    // Normal move attempt
    const ok = tryMove(selected, square);
    if (!ok) {
      // if clicked own piece, switch selection
      const maybeOwn = game.get(square);
      if (maybeOwn && maybeOwn.color === game.turn()) setSelected(square);
    }
  }

  function choosePromotion(piece) {
    if (!pendingPromotion) return;
    tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  }

  function resetGame() {
    game.reset();
    setFen(game.fen());
    setSelected(null);
    setLastMove(null);
    setPendingPromotion(null);
  }

  function undo() {
    if (game.history().length > 0) {
      game.undo();
      setFen(game.fen());
      setSelected(null);
      setLastMove(null);
      setPendingPromotion(null);
    }
  }

  function flip() {
    setOrientation((o) => (o === "white" ? "black" : "white"));
  }

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  return (
    <div className="app">
      <div className="left">
        <Board
          fen={fen}
          orientation={orientation}
          selected={selected}
          legalTargets={legalTargets}
          lastMove={lastMove}
          onSquareClick={handleSquareClick}
        />

        {pendingPromotion && (
          <div className="promo-overlay">
            <div className="promo-modal">
              <div className="promo-title">Choose promotion</div>
              {["q", "r", "b", "n"].map((p) => (
                <button key={p} className="promo-btn" onClick={() => choosePromotion(p)}>
                  {p.toUpperCase()}
                </button>
              ))}
              <button
                className="promo-cancel"
                onClick={() => setPendingPromotion(null)}
                title="Cancel promotion"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="right">
        <h2>Chess</h2>
        <div className="status">{status}</div>

        <div className="controls">
          <button onClick={undo}>Undo</button>
          <button onClick={resetGame}>Reset</button>
          <button onClick={flip}>Flip Board</button>
        </div>

        <div className="io">
          <div className="io-row">
            <label>FEN</label>
            <textarea readOnly value={fen} rows={3} />
            <button onClick={() => copy(fen)}>Copy</button>
          </div>

          <div className="io-row">
            <label>PGN</label>
            <textarea readOnly value={game.pgn()} rows={8} />
            <button onClick={() => copy(game.pgn())}>Copy</button>
          </div>
        </div>

        <details>
          <summary>How to play</summary>
          <ul>
            <li>Click a piece, then click a highlighted target square.</li>
            <li>Promotion offers a simple picker (Q/R/B/N).</li>
            <li>Use Flip to view from Black’s side.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
