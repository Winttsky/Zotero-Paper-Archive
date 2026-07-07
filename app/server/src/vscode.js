import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function assertOpenableNote(notePath) {
  if (!notePath) {
    throw new Error("notePath is required.");
  }

  const resolved = path.resolve(notePath);
  const notesRoot = path.resolve(config.paths.notesRoot);
  if (!isInside(notesRoot, resolved) || path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Only Markdown notes under the configured notes root can be opened.");
  }

  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isFile()) {
    throw new Error("Markdown note was not found on disk.");
  }

  return resolved;
}

function vscodeCandidates() {
  const candidates = ["code.cmd", "code"];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
    candidates.push(
      path.join(localAppData, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
      path.join(programFiles, "Microsoft VS Code", "bin", "code.cmd"),
      path.join(programFilesX86, "Microsoft VS Code", "bin", "code.cmd")
    );
  }
  return candidates.filter(Boolean);
}

function spawnDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    shell: false,
    windowsHide: true
  });
  child.unref();
}

export async function openNoteInVSCode(notePath) {
  const resolved = await assertOpenableNote(notePath);
  const candidates = vscodeCandidates();
  let lastError = null;

  for (const candidate of candidates) {
    try {
      spawnDetached(candidate, ["-r", resolved]);
      return { opened: true, notePath: resolved, command: candidate };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not launch VS Code. Install the 'code' command or add VS Code to PATH. ${
      lastError?.message || ""
    }`.trim()
  );
}
