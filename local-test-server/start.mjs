#!/usr/bin/env node
// Wrapper to keep the DLC test server alive in non-TTY environments
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "server.js");

const child = spawn(process.execPath, [serverPath], {
  cwd: __dirname,
  stdio: ["ignore", "inherit", "inherit"],
  detached: false,
});

child.on("error", (err) => {
  console.error("[wrapper] Failed to start server:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  // Restart on crash (but not on intentional kill)
  if (code !== 0 && code !== null) {
    console.error(`[wrapper] Server exited with code ${code}, signal ${signal}`);
  }
});

// Forward signals
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

console.log(`[wrapper] Starting DLC Protection Server...`);
