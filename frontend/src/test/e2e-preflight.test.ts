// @vitest-environment node

import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, expect, it } from "vitest";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../../e2e/check-ports.mjs", import.meta.url));
const cleanups: Array<() => Promise<void>> = [];

async function silentServer() {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    // Keep the connection open without sending an HTTP response.
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  async function close() {
    for (const socket of sockets) socket.destroy();
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
  cleanups.push(close);
  return { address: `http://127.0.0.1:${port}`, close };
}

afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

it("allows a free port", async () => {
  const server = await silentServer();
  await server.close();

  const result = await run(process.execPath, [script, server.address], { timeout: 3_000 });

  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
});

it("rejects an occupied port without waiting for an HTTP response", async () => {
  const server = await silentServer();

  await expect(run(process.execPath, [script, server.address], { timeout: 3_000 })).rejects.toMatchObject({
    code: 1,
    killed: false,
    stderr: expect.stringContaining(`E2E port is already in use: ${server.address}`),
  });
});

it("checks the second port even when the first is free", async () => {
  const free = await silentServer();
  await free.close();
  const occupied = await silentServer();

  await expect(run(process.execPath, [script, free.address, occupied.address], { timeout: 3_000 })).rejects.toMatchObject({
    code: 1,
    killed: false,
    stderr: expect.stringContaining(`E2E port is already in use: ${occupied.address}`),
  });
});
