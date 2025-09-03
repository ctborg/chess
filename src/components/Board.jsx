import { Chess } from "chess.js";
import piece2d from "../assets/pieces/2d";

const UNICODE = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export default function Board({
  fen,
  orientation = "white",
  selected,
  legalTargets = new Set(),
  lastMove,
  onSquareClick
}) {
  const chess = new Chess(fen);

  const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const files = orientation === "white" ? FILES : [...FILES].reverse();

  return (
    <div className={`board ${orientation}`}>
      {ranks.map((rank) => (
        <div key={rank} className="rank-row">
          {files.map((file) => {
            const square = `${file}${rank}`;
            const piece = chess.get(square);
            const isDark =
              (FILES.indexOf(file) + rank) % 2 === 1;
            const isSelected = selected === square;
            const isTarget = legalTargets.has(square);
            const wasLastMove =
              lastMove &&
              (lastMove.from === square || lastMove.to === square);

            return (
              <div
                key={square}
                className={[
                  "square",
                  isDark ? "dark" : "light",
                  isSelected ? "selected" : "",
                  isTarget ? "target" : "",
                  wasLastMove ? "lastmove" : ""
                ].join(" ")}
                onClick={() => onSquareClick(square)}
                data-square={square}
                title={square}
              >
                {piece ? (
                  <span className={`piece ${piece.color}${piece.type}`}>
                    <img 
			src={pieces2d[piece.color][piece.type]}
                        alt={`piece ${piece.color}${piece.type}`}
			className="piece" />
                  </span>
                ) : isTarget ? <span className="dot" /> : null}
              </div>
            );
          })}
        </div>
      ))}
      {/* File labels */}
      <div className="file-labels">
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
      {/* Rank labels */}
      <div className="rank-labels">
        {ranks.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
    </div>
  );
}
