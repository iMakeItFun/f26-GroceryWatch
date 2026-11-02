import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ZSH_STARTUP_FILES = [".zshenv", ".zprofile", ".zshrc"];

function decodeWindowsOutput(output: Buffer) {
  const text =
    output.length >= 2 && output[0] === 0xff && output[1] === 0xfe
      ? output.subarray(2).toString("utf16le")
      : output.toString("utf8");
  return text.replace(/^\uFEFF/, "").trim();
}

function windowsUserEnv(name: string) {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `[Environment]::GetEnvironmentVariable(${JSON.stringify(name)}, 'User')`,
      ],
      { windowsHide: true, timeout: 10000 }
    );
    return decodeWindowsOutput(output);
  } catch {
    return "";
  }
}

function launchctlGetenv(name: string) {
  try {
    const output = execFileSync("launchctl", ["getenv", name], {
      timeout: 10000,
    });
    return output.toString("utf8").trim();
  } catch {
    return "";
  }
}

function unquoteExportValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function exportFromFile(filePath: string, name: string) {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return "";
  }

  const pattern = new RegExp(`^\\s*export\\s+${name}\\s*=\\s*(.*)$`);
  let found = "";
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    found = unquoteExportValue(match[1].trim());
  }
  return found.trim();
}

function darwinUserEnv(name: string) {
  const fromLaunchd = launchctlGetenv(name);
  if (fromLaunchd.length > 0) return fromLaunchd;

  const home = homedir();
  for (const fileName of ZSH_STARTUP_FILES) {
    const value = exportFromFile(join(home, fileName), name);
    if (value.length > 0) return value;
  }
  return "";
}

function platformUserEnv(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "";
  if (process.platform === "win32") return windowsUserEnv(name);
  if (process.platform === "darwin") return darwinUserEnv(name);
  return "";
}

export function userEnv(name: string) {
  const fromUser = platformUserEnv(name);
  if (fromUser.length > 0) return fromUser;
  return process.env[name]?.trim() ?? "";
}
