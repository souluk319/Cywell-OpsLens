import { spawn } from "node:child_process";

const commands = [
  ["api", ["run", "-w", "@kugnus/api", "dev"]],
  ["web", ["run", "-w", "@kugnus/web", "dev"]]
];

const children = commands.map(([name, args]) => {
  const child = spawn("npm", args, {
    stdio: "inherit",
    shell: true,
    env: process.env
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      for (const other of children) {
        if (other !== child) {
          other.kill();
        }
      }
      process.exit(code ?? 1);
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
