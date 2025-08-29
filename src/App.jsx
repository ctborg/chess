import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board from "./components/Board.jsx";
import Board3D from "./components/Board3D.jsx";

export default function App() {
  // Single in-memory game (app/server remains stateless)
  const chessRef = useRef(new Chess());

  const [fen, setFen] = useState(chessRef.current.fen());
  const [selected, setSelected] = useState(null); // "e2", etc.
  const [orientation, setOrientation] = useState("white"); // "white" | "black"
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to } | null
  const [lastMove, setLastMove] = useState(null); // { from, to } | null
  const [mode, setMode] = useState("2d"); // "2d" | "3d"

  const game = chessRef.current;

  const status = useMemo(() => {
    if (game.isCheckmate()) return "Checkmate";
    if (game.isStalemate()) return "Stalemate";
    if (game.isDraw()) return "Draw";
    if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} in check`;
    return `${game.turn() === "w" ? "White" : "Black"} to move`;
  }, [fen]);

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
    if (pendingPromotion) return;

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

    // If moving a pawn to last rank, trigger promotion picker
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

    const ok = tryMove(selected, square);
    if (!ok) {
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
        {mode === "2d" ? (
          <Board
            fen={fen}
            orientation={orientation}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
          />
        ) : (
          <Board3D
            fen={fen}
            orientation={orientation}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
          />
        )}

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

        <div className="controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Render mode">
            <option value="2d">2D</option>
            <option value="3d">3D (WebGL)</option>
          </select>
          <button onClick={flip}>Flip Board</button>
          <button onClick={undo}>Undo</button>
          <button onClick={resetGame}>Reset</button>
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
            <li>Use the dropdown to switch between 2D and 3D.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
