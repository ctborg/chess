import { useState, useRef, useMemo } from "react";
import { Chess } from "chess.js";
import Board from "./components/Board.jsx";
import Board3D from "./components/Board3D.jsx";

export default function App() {
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [viewMode, setViewMode] = useState("2d"); // "2d" | "3d"
  const [orientation, setOrientation] = useState("white");
  // ... other state + handlers from before ...

  return (
    <div className="app">
      <div className="left">
        {viewMode === "2d" ? (
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
            onSquareClick={handleSquareClick}
          />
        )}
      </div>

      <div className="right">
        <h2>Chess</h2>
        <button onClick={() => setViewMode(viewMode === "2d" ? "3d" : "2d")}>
          Switch to {viewMode === "2d" ? "3D" : "2D"}
        </button>
        {/* ...existing controls/status/PGN/FEN... */}
      </div>
    </div>
  );
}
