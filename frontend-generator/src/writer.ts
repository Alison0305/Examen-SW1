import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { GeneratedFile } from "./model.js";

export class GeneratedOutputPathError extends Error {}

/** Builds a package-local file specifier without depending on a working directory. */
export function assistantCoreDependencyFor(outputRoot: string, assistantCoreRoot: string): string {
  const specifier = relative(resolve(outputRoot), resolve(assistantCoreRoot)).split(sep).join("/");
  return `file:${specifier.startsWith(".") ? specifier : `./${specifier}`}`;
}

export function validateGeneratedFiles(files: readonly GeneratedFile[]): void {
  const paths = new Set<string>();
  for (const file of files) {
    if (!file.path || file.path.includes("\\") || /^(?:[a-z]:|\/|\\\\)/i.test(file.path) || file.path.split("/").some((part) => !part || part === "." || part === "..")) throw new GeneratedOutputPathError(`Ruta lógica no segura: ${file.path}`);
    if (file.content.includes("\r")) throw new GeneratedOutputPathError(`El contenido debe usar LF: ${file.path}`);
    const key = file.path.toLowerCase();
    if (paths.has(key)) throw new GeneratedOutputPathError(`Ruta lógica duplicada: ${file.path}`);
    paths.add(key);
  }
}

export async function writeGeneratedFiles(outputRoot: string, files: readonly GeneratedFile[]): Promise<void> {
  validateGeneratedFiles(files);
  const root = resolve(outputRoot); const staging = `${root}.staging-${randomUUID()}`; const backup = `${root}.backup-${randomUUID()}`;
  await mkdir(dirname(root), { recursive: true });
  try {
    for (const file of files) { const destination = resolve(staging, ...file.path.split("/")); if (relative(staging, destination).startsWith(`..${sep}`) || relative(staging, destination) === "..") throw new GeneratedOutputPathError(`Ruta fuera del directorio de salida: ${file.path}`); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, file.content, "utf8"); }
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  try { await rename(root, backup); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") { await rm(staging, { recursive: true, force: true }); throw error; } }
  try { await rename(staging, root); } catch (error) { await rename(backup, root).catch(() => undefined); await rm(staging, { recursive: true, force: true }); throw error; }
  await rm(backup, { recursive: true, force: true });
}
