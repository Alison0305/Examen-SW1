import { describe, expect, it } from "vitest";
import { assistantCoreDependencyFor, GeneratedOutputPathError, validateGeneratedFiles } from "./writer.js";

describe("writer seguro", () => {
  it("rechaza rutas fuera del output y contenido no determinista CRLF", () => {
    expect(() => validateGeneratedFiles([{ path: "../secret", content: "x\n" }])).toThrow(GeneratedOutputPathError);
    expect(() => validateGeneratedFiles([{ path: "app/page.tsx", content: "x\r\n" }])).toThrow(GeneratedOutputPathError);
  });
  it("calcula el especificador de assistant-core relativo al output", () => {
    expect(assistantCoreDependencyFor("C:/workspace/output/frontend", "C:/workspace/assistant-core")).toBe("file:../../assistant-core");
  });
});
