import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { GeneratedFile } from "./model.js";

export class GeneratedOutputPathError extends Error {}

export async function writeGeneratedFiles(outputRoot: string, files: readonly GeneratedFile[]): Promise<void> {
  validateGeneratedFiles(files);
  const root = resolve(outputRoot);
  const staging = `${root}.staging-${randomUUID()}`;
  const backup = `${root}.backup-${randomUUID()}`;
  await mkdir(dirname(root), { recursive: true });
  try {
    await Promise.all(files.map(async (file) => {
      const destination = resolve(staging, ...file.path.split("/"));
      if (!destination.startsWith(`${staging}\\`) && destination !== staging) throw new GeneratedOutputPathError(`Ruta fuera del directorio de salida: ${file.path}`);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.content, "utf8");
    }));
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  try {
    await rename(root, backup);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }
  try {
    await rename(staging, root);
  } catch (error) {
    await rename(backup, root).catch(() => undefined);
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

export function validateGeneratedFiles(files: readonly GeneratedFile[]): void {
  const paths = new Set<string>();
  for (const file of files) {
    const path = file.path;
    if (!path || path.includes("\\") || /^(?:[a-z]:|\/|\\\\)/i.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) throw new GeneratedOutputPathError(`Ruta lógica no segura: ${path}`);
    if (file.content.includes("\r")) throw new GeneratedOutputPathError(`El contenido debe usar LF: ${path}`);
    const key = path.toLowerCase();
    if (paths.has(key)) throw new GeneratedOutputPathError(`Ruta lógica duplicada: ${path}`);
    paths.add(key);
  }
}
