// @vitest-environment node

import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it, vi } from "vitest";

const configPath = fileURLToPath(new URL("../../playwright.config.ts", import.meta.url));
const playwrightPath = fileURLToPath(new URL("../../node_modules/@playwright/test/index.mjs", import.meta.url));
const cli = fileURLToPath(new URL("../../node_modules/@playwright/test/cli.js", import.meta.url));
const serverNames = ["backend", "frontend"] as const;

function signalProcess(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function isAlive(pid: number): boolean {
  return signalProcess(pid, 0);
}

async function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const connection = createConnection({ host: "127.0.0.1", port });
    connection.once("connect", () => {
      connection.destroy();
      resolve(true);
    });
    connection.once("error", (error) => {
      connection.destroy();
      if ((error as NodeJS.ErrnoException).code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
    connection.setTimeout(1_000, () => {
      connection.destroy();
      reject(new Error(`Timed out checking test server port ${port}`));
    });
  });
}

// Windows does not deliver these Unix signals to Node.js signal handlers.
it.skipIf(process.platform === "win32").each(["SIGINT", "SIGTERM"] as const)(
  "stops Playwright-managed servers when the runner receives %s",
  async (signal) => {
    const directory = await mkdtemp(join(tmpdir(), "orbirig-e2e-shutdown-"));
    const metadata = async (name: string): Promise<{ pid: number; port: number }> =>
      JSON.parse(await readFile(join(directory, `${name}.json`), "utf8"));

    await writeFile(join(directory, "server.cjs"), `
      const { writeFileSync } = require("node:fs");
      const { createServer } = require("node:http");
      const server = createServer((request, response) => response.end("ready"));
      server.listen(0, "127.0.0.1", () => {
        writeFileSync(process.env.SERVER_NAME + ".json", JSON.stringify({
          pid: process.pid, port: server.address().port,
        }));
        console.log("SHUTDOWN_TEST_SERVER_READY");
      });
      process.once("SIGTERM", () => server.close(() => process.exit(0)));
    `);
    await writeFile(join(directory, "hold.spec.ts"), `
      import { writeFileSync } from "node:fs";
      import { test } from ${JSON.stringify(playwrightPath)};
      test("await interruption", async () => {
        writeFileSync("test-ready", "");
        await new Promise(() => {});
      });
    `);
    // Import the real configuration so removing its signal handler breaks this test.
    // Temporary Node servers need neither Python nor installed browser builds.
    await writeFile(join(directory, "playwright.config.ts"), `
      import original from ${JSON.stringify(configPath)};
      export default {
        ...original,
        testDir: ${JSON.stringify(directory)},
        outputDir: ${JSON.stringify(join(directory, "results"))},
        reporter: [["list"]],
        globalTimeout: 15_000,
        projects: [original.projects[0]],
        webServer: original.webServer.map((server, index) => ({
          ...server,
          command: "node server.cjs",
          cwd: ${JSON.stringify(directory)},
          url: undefined,
          wait: { stdout: /SHUTDOWN_TEST_SERVER_READY/ },
          env: { SERVER_NAME: ["backend", "frontend"][index] },
        })),
      };
    `);

    const runner = spawn(process.execPath, [cli, "test", "--config", join(directory, "playwright.config.ts")], {
      cwd: directory,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    runner.on("error", (error) => { output += error.message; });
    runner.stdout.on("data", (chunk) => { output += chunk; });
    runner.stderr.on("data", (chunk) => { output += chunk; });
    const hasExited = () => runner.exitCode !== null || runner.signalCode !== null;
    try {
      await vi.waitFor(() => access(join(directory, "test-ready")), { timeout: 10_000 });
      const servers = await Promise.all(serverNames.map(metadata));
      for (const server of servers) expect(await isPortOpen(server.port)).toBe(true);

      expect(runner.kill(signal)).toBe(true);
      await vi.waitFor(() => expect(hasExited()).toBe(true), { timeout: 10_000 });
      for (const server of servers) {
        await expect.poll(() => isPortOpen(server.port), { timeout: 3_000 }).toBe(false);
        await expect.poll(() => isAlive(server.pid), { timeout: 3_000 }).toBe(false);
      }
      expect(runner.signalCode).toBeNull();
      expect(runner.exitCode).toBe(130);
    } catch (error) {
      throw new Error(`Playwright shutdown check failed after ${signal}:\n${output}`, { cause: error });
    } finally {
      // A regression must not leave the deliberately orphaned test servers running.
      if (!hasExited()) {
        runner.kill("SIGINT");
        await vi.waitFor(() => expect(hasExited()).toBe(true), { timeout: 5_000 }).catch(() => {
          if (runner.pid !== undefined) signalProcess(-runner.pid, "SIGKILL");
        });
        await vi.waitFor(() => expect(hasExited()).toBe(true), { timeout: 3_000 });
      }
      for (const name of serverNames) {
        const server = await metadata(name).catch(() => null);
        if (server !== null && isAlive(server.pid)) {
          signalProcess(server.pid, "SIGTERM");
          await vi.waitFor(() => expect(isAlive(server.pid)).toBe(false), { timeout: 3_000 }).catch(async () => {
            signalProcess(server.pid, "SIGKILL");
            await vi.waitFor(() => expect(isAlive(server.pid)).toBe(false), { timeout: 3_000 });
          });
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
