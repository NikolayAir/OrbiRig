import { createConnection } from "node:net";

import { E2E_BACKEND_URL, E2E_FRONTEND_URL } from "./servers.mjs";

// Playwright's initial HTTP check runs before its webServer timeout starts.
// Check TCP first so a process that never answers HTTP cannot stall the run.
/** @param {string} address @returns {Promise<void>} */
function assertPortFree(address) {
  const url = new URL(address);
  return new Promise((resolve, reject) => {
    const connection = createConnection({ host: url.hostname, port: Number(url.port) });
    const timer = setTimeout(() => {
      connection.destroy();
      reject(new Error(`Timed out checking the E2E port: ${address}`));
    }, 1_000);

    connection.once("connect", () => {
      clearTimeout(timer);
      connection.destroy();
      reject(new Error(`E2E port is already in use: ${address}. Free it before running browser tests.`));
    });
    connection.once("error", (error) => {
      clearTimeout(timer);
      connection.destroy();
      if ("code" in error && error.code === "ECONNREFUSED") {
        resolve();
      } else {
        reject(new Error(`Cannot check the E2E port ${address}: ${error.message}`));
      }
    });
  });
}

// Tests pass their own addresses to avoid using the fixed E2E ports.
const addresses = process.argv.slice(2);
try {
  await Promise.all(
    (addresses.length ? addresses : [E2E_BACKEND_URL, E2E_FRONTEND_URL]).map(assertPortFree),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
