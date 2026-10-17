/**
 * Wire protocol version exchanged during the WebSocket handshake (`?proto=<u32>`).
 * Must match `PROTOCOL_VERSION` in `server-rs/src/protocol/mod.rs`.
 */
export const PROTOCOL_VERSION = 1;

/** WebSocket close code sent by `server-rs` when `proto` does not match `PROTOCOL_VERSION`. */
export const PROTOCOL_MISMATCH_CLOSE_CODE = 4001;

/**
 * Formats the player-facing message for a 4001 protocol mismatch close reason.
 * Expected server reason format: `protocol version mismatch: server=<S> client=<C>`
 */
export function formatProtocolMismatchMessage(reason?: string): string {
  const match = reason?.match(
    /protocol version mismatch:\s*server=(\d+)\s+client=(\d+)/i,
  );
  if (match) {
    const serverVer = Number(match[1]);
    const clientVer = Number(match[2]);
    if (clientVer > serverVer) {
      return `The server is older than this client (client protocol ${clientVer}, server protocol ${serverVer}). Try again in a minute.`;
    }
    return `This game client is out of date (client protocol ${clientVer}, server protocol ${serverVer}). Reload the page to update.`;
  }
  return "This game client is out of date. Reload the page to update.";
}
