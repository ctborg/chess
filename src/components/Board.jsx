// src/components/Board.jsx
import React from "react";
import { Chess } from "chess.js";
import pieceSets from "../assets/pieces2d";

const FILES = "abcdefgh";

/**
 * 2D Chess board using SVG piece sets.
 * Props:
 * - fen: string
 * - orientation: "white" | "black"
 * - selected: "e2" | null
 * - legalTargets: Set<string> of squares (e.g., new Set(["e4","e3"]))
 * - lastMove: { from: "e2", to: "e4" } | null
 * - onSquareClick: (square: string) => void
 * - pieceTheme: key of pieceSets (e.g., "merida")
 */
export default function Board({
  fen,
  orientation = "white",
  selected = null,
  legalTargets = new Set(),
  lastMove = null,
  onSquareClick,
  pieceTheme = "merida"
}) {
  const chess = new Chess(fen);
  const board = chess.board(); // array[8][8], ranks 8..1 (top..bottom)
  const set = pieceSets[pieceTheme] || pieceSets.merida;

  // Render ranks according to orientation
  const ranks = orientation === "white"
    ? [...board].reverse().map((row, idx) => renderRank(row, 7 - idx))
    : board.map((row, idx) => renderRank(row, idx));

  return (
    <div className="board2d" aria-label="2D Chess Board">
      {ranks}
    </div>
  );

  function renderRank(row, rankIndex) {
    // rankIndex is 0..7 -> algebraic rank = rankIndex+1
    return (
      <div className="rank" key={rankIndex}>
        {row.map((square, fileIndex) => renderSquare(square, fileIndex, rankIndex))}
      </div>
    );
  }

  function renderSquare(square, fileIndex, rankIndex) {
    const sq = `${FILES[fileIndex]}${rankIndex + 1}`;
    const dark = (fileIndex + rankIndex) % 2 === 1;

    let highlight = "";
    if (lastMove && (sq === lastMove.from || sq === lastMove.to)) {
      highlight = " last-move";
    } else if (sq === selected) {
      highlight = " selected";
    } else if (legalTargets.has(sq)) {
      highlight = " target";
    }

    const pieceImg =
      square &&
      set[square.type.toUpperCase()] &&
      set[square.type.toUpperCase()][square.color];

    return (
      <div
        key={sq}
        className={`square ${dark ? "dark" : "light"}${highlight}`}
        role="button"
        aria-label={`Square ${sq}`}
        onClick={() => onSquareClick(sq)}
      >
        {pieceImg && (
          <img
            src={pieceImg}
            alt={`${square.color}${square.type}`}
            className="piece"
            draggable="false"
          />
        )}
      </div>
    );
  }
}
