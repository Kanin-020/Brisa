import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import { TaskManager, CancelledError, throwIfAborted } from "../src/core/tasks";
import { download } from "../src/core/download";
import type { AppConfig } from "../src/core/config";

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("tasks: throwIfAborted throws CancelledError when the signal is aborted", () => {
  const ac = new AbortController();
  ac.abort();
  assert.throws(() => throwIfAborted(ac.signal), CancelledError);
  // Signal sin abortar: no lanza.
  assert.doesNotThrow(() => throwIfAborted(new AbortController().signal));
});

test("tasks: TaskManager completes with result and progress", async () => {
  const tm = new TaskManager();
  const { id, info } = tm.start({ type: "test", portId: "soh", label: "SoH" }, async (ctx) => {
    ctx.update("download", 50, 100);
    assert.strictEqual(ctx.signal.aborted, false);
    return 42;
  });
  assert.strictEqual(info.status, "running");
  assert.strictEqual(info.portId, "soh");
  await sleep(20);
  const t = tm.get(id);
  assert.strictEqual(t?.status, "done");
  assert.strictEqual(t?.result, 42);
  assert.strictEqual(t?.pct, 100);
  assert.ok(t && t.finishedAt! > 0);
});

test("tasks: hasRunning prevents duplicate tasks for the same port", async () => {
  const tm = new TaskManager();
  const { id } = tm.start({ type: "install", portId: "soh", label: "SoH" }, async () => {
    await sleep(120);
    return 1;
  });
  assert.ok(tm.hasRunning("soh"), "el port en marcha se detecta");
  assert.ok(tm.hasRunning(), "hay al menos una tarea en marcha");
  assert.ok(!tm.hasRunning("oot"), "otro port está libre");
  tm.cancel(id);
  await sleep(150);
  assert.ok(!tm.hasRunning("soh"), "tras cancelar no queda tarea en marcha");
});

test("tasks: a failing task ends with error and message", async () => {
  const tm = new TaskManager();
  const { id } = tm.start({ type: "test", label: "x" }, async () => {
    throw new Error("boom");
  });
  await sleep(20);
  const t = tm.get(id);
  assert.strictEqual(t?.status, "error");
  assert.strictEqual(t?.error, "boom");
});

test("tasks: cancelling an in-flight download cleans the partial file", async () => {
  const total = 10 * 1024 * 1024; // 10 MB
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Length": String(total) });
    const chunk = Buffer.alloc(64 * 1024, 1);
    let sent = 0;
    const timer = setInterval(() => {
      if (sent >= total) {
        clearInterval(timer);
        res.end();
        return;
      }
      sent += chunk.length;
      res.write(chunk);
    }, 25);
    res.on("close", () => clearInterval(timer));
  });
  const url = await listen(server);
  const cfg = { cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), "brisa-tasks-")) } as AppConfig;
  const dest = path.join(cfg.cacheDir, "big.bin");
  const tm = new TaskManager();
  const { id } = tm.start({ type: "download", label: "big" }, async (ctx) => {
    await download(cfg, url + "/big.bin", dest, undefined, { signal: ctx.signal });
    return true;
  });
  // Cancela a mitad de la descarga (servidor manda ~2.5 MB en 400 ms).
  setTimeout(() => tm.cancel(id), 400);
  let t = tm.get(id);
  for (let i = 0; i < 40 && (!t || t.status === "running"); i++) {
    await sleep(50);
    t = tm.get(id);
  }
  assert.strictEqual(t?.status, "cancelled");
  assert.strictEqual(t?.error, null);
  assert.ok(!fs.existsSync(dest), "el archivo parcial debe eliminarse al cancelar");
  server.close();
});
