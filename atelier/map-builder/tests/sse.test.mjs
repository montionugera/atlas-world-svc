import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createEventHub } from "../lib/sse.mjs";

const withServer = async (fn) => {
  const hub = createEventHub({ replay: 200 });
  const server = http.createServer((req, res) => hub.handle(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(port, hub);
  } finally {
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }
};

// Connects, collects raw bytes until `count` "\n\n"-terminated frames have
// arrived (the leading ": ok\n\n" comment counts as frame 0), then aborts the
// connection and resolves with the frames after the comment.
const connect = (port, headers = {}) => {
  const req = http.request({ host: "127.0.0.1", port, path: "/api/events", headers });
  let buf = "";
  const frames = [];
  const waiters = []; // { n, resolve } — a frame batch can satisfy several at once
  req.on("response", (res) => {
    res.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        frames.push(buf.slice(0, idx + 2));
        buf = buf.slice(idx + 2);
      }
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (frames.length > waiters[i].n) { waiters[i].resolve(frames[waiters[i].n]); waiters.splice(i, 1); }
      }
    });
  });
  req.end();
  return {
    req,
    frames,
    nextFrame: (n) => new Promise((resolve) => {
      if (frames.length > n) return resolve(frames[n]);
      waiters.push({ n, resolve });
    }),
    close: () => req.destroy(),
  };
};

test("emit delivers the exact SSE wire frame to a connected client", async () => {
  await withServer(async (port, hub) => {
    const client = connect(port);
    await client.nextFrame(0); // the initial ": ok\n\n" comment
    const id = hub.emit("job.step", { a: 1 });
    const frame = await client.nextFrame(1);
    assert.equal(frame, `id: ${id}\nevent: job.step\ndata: ${JSON.stringify({ a: 1 })}\n\n`);
    client.close();
  });
});

test("reconnecting with Last-Event-ID replays only later events", async () => {
  await withServer(async (port, hub) => {
    const id1 = hub.emit("job.step", { n: 1 });
    const id2 = hub.emit("job.step", { n: 2 });
    const client = connect(port, { "Last-Event-ID": String(id1) });
    const replayed = await client.nextFrame(1); // frame 0 is the ": ok" comment
    assert.equal(replayed, `id: ${id2}\nevent: job.step\ndata: ${JSON.stringify({ n: 2 })}\n\n`);
    client.close();
  });
});

test("clients() tracks connect and drops on socket end", async () => {
  await withServer(async (port, hub) => {
    const client = connect(port);
    await client.nextFrame(0);
    assert.equal(hub.clients(), 1);
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(hub.clients(), 0);
  });
});
