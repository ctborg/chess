import { useMemo, useRef, useState, useEffect } from "react";
import { Chess } from "chess.js";
import Board from "./components/Board.jsx";
import Board3D from "./components/Board3D.jsx";
import { connectP2P } from "./net/p2p";

export default function App() {
  // Core chess state
  const chessRef = useRef(new Chess());
  const game = chessRef.current;

  const [fen, setFen] = useState(game.fen());
  const [selected, setSelected] = useState(null);
  const [orientation, setOrientation] = useState("white"); // "white" | "black"
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [mode, setMode] = useState("2d"); // "2d" | "3d"

  // P2P state
  const [mpEnabled, setMpEnabled] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [myColor, setMyColor] = useState(null); // "w" | "b" | null (until assigned)
  const [peerCount, setPeerCount] = useState(0);
  const p2pRef = useRef(null); // { room, sendMove, onMove, ... }

  // Derived UI status
  const status = useMemo(() => {
    if (game.isCheckmate()) return "Checkmate";
    if (game.isStalemate()) return "Stalemate";
    if (game.isDraw()) return "Draw";
    if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} in check`;
    return `${game.turn() === "w" ? "White" : "Black"} to move`;
  }, [fen]);

  const legalTargets = useMemo(() => {
    if (!selected) return new Set();
    return new Set(game.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [selected, fen]);

  // ---------- Core helpers ----------
  function softResetSelections() {
    setSelected(null);
    setPendingPromotion(null);
    setLastMove(null);
  }

  function applyFenString(nextFen) {
    game.load(nextFen);
    setFen(game.fen());
    softResetSelections();
  }

  function tryMove(from, to, promotion) {
    const mv = game.move({ from, to, promotion });
    if (mv) {
      setFen(game.fen());
      setSelected(null);
      setLastMove({ from, to });
      return true;
    }
    return false;
  }

  function handleSquareClick(square) {
    if (pendingPromotion) return;

    // Multiplayer: only allow acting on your turn with your color
    if (mpEnabled && myColor) {
      // first click: must select your own piece and only when it's your turn
      if (!selected) {
        const piece = game.get(square);
        if (!piece) return;
        if (game.turn() !== myColor) return;
        if (piece.color !== myColor) return;
        setSelected(square);
        return;
      }
      // second click: still must be your turn
      if (game.turn() !== myColor) return;
    }

    if (!selected) {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) setSelected(square);
      return;
    }

    if (square === selected) {
      setSelected(null);
      return;
    }

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
    if (ok) {
      // Broadcast local move to peer
      if (mpEnabled && p2pRef.current) {
        p2pRef.current.sendMove({ from: selected, to: square });
      }
    } else {
      const maybeOwn = game.get(square);
      if (maybeOwn && maybeOwn.color === game.turn()) setSelected(square);
    }
  }

  function choosePromotion(piece) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    const ok = tryMove(from, to, piece);
    setPendingPromotion(null);
    if (ok && mpEnabled && p2pRef.current) {
      p2pRef.current.sendMove({ from, to, promotion: piece });
    }
  }

  function resetGame(broadcast = true) {
    game.reset();
    setFen(game.fen());
    softResetSelections();
    if (mpEnabled && p2pRef.current && broadcast) {
      p2pRef.current.sendCtrl({ type: "reset" });
      // host also re-syncs canonical state
      if (isHost) p2pRef.current.sendSync({ fen: game.fen(), orientation });
    }
  }

  function undo(broadcast = true) {
    if (game.history().length > 0) {
      game.undo();
      setFen(game.fen());
      softResetSelections();
      if (mpEnabled && p2pRef.current && broadcast) {
        p2pRef.current.sendCtrl({ type: "undo" });
      }
    }
  }

  function flip() {
    setOrientation((o) => (o === "white" ? "black" : "white"));
  }

  // ---------- P2P wiring ----------
  async function connectRoom() {
    if (!roomCode.trim()) return;

    const conn = await connectP2P(roomCode.trim(), { appId: "chess-app" });
    p2pRef.current = conn;

    // Count peers & determine host/guest
    const updatePeerCount = () => {
      // Trystero exposes room.getPeers(); treat size === 0 as "first in room"
      try {
        const size = conn.room.getPeers?.().size ?? 0;
        setPeerCount(size);
        setIsHost(size === 0); // if no peers yet, you're hosting
        if (size === 0) setMyColor("w"); // host is white by default
      } catch {
        // if API differs, ignore count
      }
    };
    updatePeerCount();

    conn.room.onPeerJoin?.((_peerId) => {
      updatePeerCount();
      // Host syncs state and assigns colors when someone joins
      if (isHost) {
        conn.sendSync({ fen: game.fen(), orientation });
        conn.sendCtrl({ type: "assign", color: "b" });
        setMyColor("w");
      }
    });

    conn.room.onPeerLeave?.((_peerId) => {
      updatePeerCount();
    });

    // Receive a move from the peer
    conn.onMove((_peerId, data) => {
      const { from, to, promotion } = data || {};
      tryMove(from, to, promotion);
    });

    // Receive a full state sync from host
    conn.onSync((_peerId, data) => {
      if (!data) return;
      if (typeof data.orientation === "string") setOrientation(data.orientation);
      if (typeof data.fen === "string") applyFenString(data.fen);
      // If guest hasn't been assigned yet, they'll get an assign shortly.
    });

    // Control messages (assign/undo/reset)
    conn.onCtrl((_peerId, msg) => {
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "assign":
          // Host tells guest their color
          setMyColor(msg.color === "w" ? "w" : "b");
          break;
        case "undo":
          undo(false); // apply locally without rebroadcast
          break;
        case "reset":
          resetGame(false); // apply locally without rebroadcast
          break;
        default:
          break;
      }
    });

    setMpEnabled(true);
  }

  function disconnectRoom() {
    try {
      p2pRef.current?.room?.leaveRoom?.();
    } catch {}
    p2pRef.current = null;
    setMpEnabled(false);
    setPeerCount(0);
    setIsHost(false);
    setMyColor(null);
  }

  // Clean up on unmount
  useEffect(() => () => disconnectRoom(), []);

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
          <button onClick={() => undo()}>Undo</button>
          <button onClick={() => resetGame()}>Reset</button>
        </div>

        {/* Multiplayer panel */}
        <details open>
          <summary>Multiplayer (WebRTC)</summary>
          {!mpEnabled ? (
            <>
              <div className="io-row">
                <label>Room Code</label>
                <input
                  placeholder="e.g. my-chess-room"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                />
                <button onClick={connectRoom} disabled={!roomCode.trim()}>
                  Create / Join
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#555" }}>
                First person in becomes <b>host</b> (white). Second joins as black.
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 8 }}>
                Connected to <code>{roomCode}</code> · Peers: {peerCount} · You are{" "}
                <b>{isHost ? "Host (White)" : myColor === "b" ? "Black" : "…assigning"}</b>
              </div>
              <div className="io-row">
                <button onClick={() => p2pRef.current?.sendCtrl({ type: "undo" })}>Ask Undo</button>
                <button onClick={() => p2pRef.current?.sendCtrl({ type: "reset" })}>Ask Reset</button>
                <button onClick={disconnectRoom}>Leave</button>
              </div>
            </>
          )}
        </details>

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
            <li>Multiplayer: share a room code; host is White.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
