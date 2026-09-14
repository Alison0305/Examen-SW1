import { access, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GeneratedOutputPathError, validateGeneratedFiles, writeGeneratedFiles } from "./index.js";

const output = resolve(".generated-writer-test");
afterEach(async () => { await rm(output, { recursive: true, force: true }); });

describe("GeneratedFile writer", () => {
  it("escribe rutas lógicas relativas bajo el output root", async () => {
    await writeGeneratedFiles(output, [{ path: "src/main/App.java", content: "class App {}" }]);
    await expect(access(resolve(output, "src/main/App.java"))).resolves.toBeUndefined();
  });

  it.each(["../escape.java", "src/../../escape.java", "/absolute.java", "C:/absolute.java", "C:\\absolute.java", "\\\\server\\share\\file.java", "src\\file.java", "src//file.java", "./file.java"])("rechaza la ruta no segura %s antes de escribir", async (path) => {
    await expect(writeGeneratedFiles(output, [{ path, content: "x" }])).rejects.toBeInstanceOf(GeneratedOutputPathError);
    await expect(access(output)).rejects.toBeDefined();
  });

  it("rechaza duplicados sin distinguir mayúsculas y no deja escrituras parciales", async () => {
    expect(() => validateGeneratedFiles([{ path: "src/App.java", content: "x" }, { path: "src/app.java", content: "y" }])).toThrow(GeneratedOutputPathError);
    await expect(writeGeneratedFiles(output, [{ path: "safe.java", content: "x" }, { path: "../unsafe.java", content: "y" }])).rejects.toBeInstanceOf(GeneratedOutputPathError);
    await expect(access(resolve(output, "safe.java"))).rejects.toBeDefined();
  });

  it("conserva el output anterior cuando el conjunto no pasa la validación", async () => {
    await writeGeneratedFiles(output, [{ path: "estable.java", content: "estable" }]);
    await expect(writeGeneratedFiles(output, [{ path: "nuevo.java", content: "nuevo" }, { path: "../invalido.java", content: "invalido" }])).rejects.toBeInstanceOf(GeneratedOutputPathError);
    await expect(access(resolve(output, "estable.java"))).resolves.toBeUndefined();
    await expect(access(resolve(output, "nuevo.java"))).rejects.toBeDefined();
  });

  it("rechaza contenido CRLF antes de crear el staging", async () => {
    await expect(writeGeneratedFiles(output, [{ path: "App.java", content: "class App {}\r\n" }])).rejects.toBeInstanceOf(GeneratedOutputPathError);
    await expect(access(output)).rejects.toBeDefined();
  });
});
