#!/usr/bin/env node

import { runCli } from "./core.js";

runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr
}).then((code) => {
  process.exitCode = code;
}).catch((error) => {
  process.stderr.write(`aiflow: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
