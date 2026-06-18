#!/usr/bin/env node
import { readFileSync } from "node:fs";

const pluginName = process.argv[2] ?? "cywell-opslens";
const input = readFileSync(0, "utf8").trim();

if (!input) {
  console.error("Expected Console operator JSON on stdin.");
  process.exit(1);
}

let consoleOperator;
try {
  consoleOperator = JSON.parse(input);
} catch (error) {
  console.error(`Invalid Console operator JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const plugins = consoleOperator?.spec?.plugins;
let patch;

if (!Array.isArray(plugins)) {
  patch = [
    {
      op: "add",
      path: "/spec/plugins",
      value: [pluginName]
    }
  ];
} else if (plugins.includes(pluginName)) {
  patch = [];
} else {
  patch = [
    {
      op: "add",
      path: "/spec/plugins/-",
      value: pluginName
    }
  ];
}

process.stdout.write(`${JSON.stringify(patch, null, 2)}\n`);
