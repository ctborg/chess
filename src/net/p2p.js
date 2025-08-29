// src/net/p2p.js
// Minimal Trystero wrapper for moves/sync/control messages.
import { joinRoom } from "trystero";

export async function connectP2P(roomId, { appId = "chess-app" } = {}) {
  // Join a room; Trystero handles discovery/signaling for WebRTC peers.
  const room = joinRoom({ appId }, roomId);

  const [sendMove, onMove] = room.makeAction("move");     // {from,to,promotion?}
  const [sendSync, onSync] = room.makeAction("sync");     // {fen,orientation}
  const [sendCtrl, onCtrl] = room.makeAction("control");  // {type:'assign'|'undo'|'reset', ...}

  return {
    room,
    sendMove,
    onMove,
    sendSync,
    onSync,
    sendCtrl,
    onCtrl
  };
}
