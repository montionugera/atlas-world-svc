const HEARTBEAT_MS = 15000;

const frameOf = ({ id, type, payload }) => `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;

export function createEventHub({ replay = 200 } = {}) {
  const buffer = []; // ring of { id, type, payload }, newest last
  const clients = new Set(); // live ServerResponse objects
  let nextId = 1;

  function emit(type, payload) {
    const entry = { id: nextId++, type, payload };
    buffer.push(entry);
    if (buffer.length > replay) buffer.shift();
    const frame = frameOf(entry);
    for (const res of clients) { try { res.write(frame); } catch { /* client is going away; its close handler will clean up */ } }
    return entry.id;
  }

  function handle(req, res) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(": ok\n\n");

    const lastEventId = req.headers["last-event-id"];
    if (lastEventId !== undefined) {
      const since = Number(lastEventId);
      for (const entry of buffer) if (entry.id > since) res.write(frameOf(entry));
    }

    clients.add(res);
    const heartbeat = setInterval(() => { try { res.write(": heartbeat\n\n"); } catch { /* cleaned up on close */ } }, HEARTBEAT_MS);
    heartbeat.unref?.();
    const cleanup = () => { clearInterval(heartbeat); clients.delete(res); };
    req.on("close", cleanup);
    res.on("close", cleanup);
  }

  return {
    emit,
    handle,
    clients: () => clients.size,
    close() {
      for (const res of clients) { try { res.end(); } catch { /* already gone */ } }
      clients.clear();
    },
  };
}
