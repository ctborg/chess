import { useMemo, useRef, useState, useEffect } from "react";
import { Chess } from "chess.js";
import Board from "./components/Board.jsx";
import Board3D from "./components/Board3D.jsx";
import { connectP2P } from "./net/p2p"; // if you added P2P earlier; keep it
import { computeBestMove } from "./ai/engine";

export default function App() {
  const chessRef = useRef(new Chess());
  const game = chessRef.current;

  // Core UI / chess state
  const [fen, setFen] = useState(game.fen());
  const [selected, setSelected] = useState(null);
  const [orientation, setOrientation] = useState("white");
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [mode, setMode] = useState("2d"); // "2d" | "3d"

  // Multiplayer (keep if you already added it; otherwise you can remove this block)
  const [mpEnabled, setMpEnabled] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [myP2PColor, setMyP2PColor] = useState(null); // "w"|"b"|null
  const [peerCount, setPeerCount] = useState(0);
  const p2pRef = useRef(null);

  // Single-player vs AI
  const [spEnabled, setSpEnabled] = useState(true);
  const [spMyColor, setSpMyColor] = useState("w"); // "w" or "b"
  const [difficulty, setDifficulty] = useState("medium"); // "easy"|"medium"|"hard"
  const aiJobRef = useRef({ id: 0, cancelled: false }); // simple cancel token

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

  // ---------------- helpers ----------------
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

  function userIsAllowedToMoveAt(square) {
    // P2P: must be your color & your turn
    if (mpEnabled && myP2PColor) {
      const turn = game.turn();
      if (turn !== myP2PColor) return false;
      const piece = game.get(square);
      if (!piece || piece.color !== myP2PColor) return false;
    }
    // Single player: if AI’s turn, block human
    if (spEnabled) {
      const humanColor = spMyColor;
      if (game.turn() !== humanColor) return false;
    }
    return true;
  }

  function handleSquareClick(square) {
    if (pendingPromotion) return;

    if (!selected) {
      // first click: must pick an own piece if P2P or SP restrictions apply
      if (!userIsAllowedToMoveAt(square)) return;
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
      // P2P broadcast
      if (mpEnabled && p2pRef.current) {
        p2pRef.current.sendMove({ from: selected, to: square });
      }
      // Let AI respond if needed
      maybeMakeAIMove();
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
    if (ok) {
      if (mpEnabled && p2pRef.current) {
        p2pRef.current.sendMove({ from, to, promotion: piece });
      }
      maybeMakeAIMove();
    }
  }

  function resetGame(broadcast = true) {
    cancelAI();
    game.reset();
    setFen(game.fen());
    softResetSelections();
    if (mpEnabled && p2pRef.current && broadcast) {
      p2pRef.current.sendCtrl({ type: "reset" });
      if (isHost) p2pRef.current.sendSync({ fen: game.fen(), orientation });
    }
  }

  function undo(broadcast = true) {
    cancelAI();
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

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  // --------------- AI integration ---------------
  function aiParamsForDifficulty(level) {
    switch (level) {
      case "easy":   return { depth: 1, randomness: 0.5 };
      case "hard":   return { depth: 3, randomness: 0.0 };
      case "medium":
      default:       return { depth: 2, randomness: 0.15 };
    }
  }

  function cancelAI() {
    aiJobRef.current.cancelled = true;
    aiJobRef.current.id++;
  }

  function maybeMakeAIMove() {
    if (!spEnabled) return;
    const humanColor = spMyColor;
    // If it's not AI's turn, nothing to do
    if (game.turn() === humanColor) return;
    if (game.isGameOver()) return;

    const jobId = ++aiJobRef.current.id;
    aiJobRef.current.cancelled = false;

    const think = () => {
      if (aiJobRef.current.cancelled || jobId !== aiJobRef.current.id) return;
      const params = aiParamsForDifficulty(difficulty);
      const best = computeBestMove(game.fen(), params);
      if (!best) return;
      // Default promotions (if engine returns {from,to} w/o promotion on a pawn)
      const needsPromo = best.promotion || (game.get(best.from)?.type === "p" && (best.to.endsWith("8") || best.to.endsWith("1")));
      const move = { from: best.from, to: best.to, promotion: needsPromo ? (best.promotion || "q") : undefined };
      const ok = tryMove(move.from, move.to, move.promotion);
      if (!ok) return;
    };

    // Let the UI breathe before heavy compute
    setTimeout(think, 0);
  }

  // If single-player is enabled and the human chose black, AI should move first
  useEffect(() => {
    if (!spEnabled) return;
    // after any full reset to start position
    if (fen === new Chess().fen()) {
      if (spMyColor === "b") maybeMakeAIMove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spEnabled, spMyColor]);

  // --------------- P2P wiring (optional; keep if you already added it) ---------------
  async function connectRoom() {
    if (!roomCode.trim()) return;
    const conn = await connectP2P(roomCode.trim(), { appId: "chess-app" });
    p2pRef.current = conn;

    const updatePeerCount = () => {
      try {
        const size = conn.room.getPeers?.().size ?? 0;
        setPeerCount(size);
        setIsHost(size === 0);
        if (size === 0) setMyP2PColor("w");
      } catch {}
    };
    updatePeerCount();

    conn.room.onPeerJoin?.(() => {
      updatePeerCount();
      if (isHost) {
        conn.sendSync({ fen: game.fen(), orientation });
        conn.sendCtrl({ type: "assign", color: "b" });
        setMyP2PColor("w");
      }
    });

    conn.room.onPeerLeave?.(() => updatePeerCount());

    conn.onMove((_peerId, data) => {
      const { from, to, promotion } = data || {};
      tryMove(from, to, promotion);
    });

    conn.onSync((_peerId, data) => {
      if (!data) return;
      if (typeof data.orientation === "string") setOrientation(data.orientation);
      if (typeof data.fen === "string") applyFenString(data.fen);
    });

    conn.onCtrl((_peerId, msg) => {
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "assign":
          setMyP2PColor(msg.color === "w" ? "w" : "b");
          break;
        case "undo":
          undo(false);
          break;
        case "reset":
          resetGame(false);
          break;
        default:
          break;
      }
    });

    setMpEnabled(true);
    // Turn off single-player if you connect P2P
    setSpEnabled(false);
  }

  function disconnectRoom() {
    try { p2pRef.current?.room?.leaveRoom?.(); } catch {}
    p2pRef.current = null;
    setMpEnabled(false);
    setPeerCount(0);
    setIsHost(false);
    setMyP2PColor(null);
  }

  useEffect(() => () => disconnectRoom(), []);

  // ---------------- UI ----------------
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

        {/* Render mode controls */}
        <div className="controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Render mode">
            <option value="2d">2D</option>
            <option value="3d">3D (WebGL)</option>
          </select>
          <button onClick={flip}>Flip Board</button>
          <button onClick={() => undo()}>Undo</button>
          <button onClick={() => resetGame()}>Reset</button>
        </div>

        {/* Single Player (AI) */}
        <details open>
          <summary>Single Player (AI)</summary>
          <div className="io-row">
            <label>Enable</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setSpEnabled(true); setMpEnabled(false); }}>
                Enabled
              </button>
              <button onClick={() => setSpEnabled(false)}>Disabled</button>
            </div>
          </div>

          {spEnabled && (
            <>
              <div className="io-row">
                <label>Your Color</label>
                <select value={spMyColor} onChange={(e) => setSpMyColor(e.target.value)}>
                  <option value="w">White</option>
                  <option value="b">Black</option>
                </select>
              </div>

              <div className="io-row">
                <label>Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </>
          )}
        </details>

        {/* Multiplayer (keep if you added WebRTC) */}
        <details>
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
                <b>{isHost ? "Host (White)" : myP2PColor === "b" ? "Black" : "…"}</b>
              </div>
              <div className="io-row">
                <button onClick={() => p2pRef.current?.sendCtrl({ type: "undo" })}>Ask Undo</button>
                <button onClick={() => p2pRef.current?.sendCtrl({ type: "reset" })}>Ask Reset</button>
                <button onClick={disconnectRoom}>Leave</button>
              </div>
            </>
          )}
        </details>

        {/* FEN / PGN */}
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
            <li>Single Player: pick your color & difficulty; the AI moves automatically.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
