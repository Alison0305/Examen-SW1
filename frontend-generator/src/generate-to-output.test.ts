import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { frontendFixture } from "./frontend-fixture.js";
import { generateFrontendToOutput } from "./generate-to-output.js";
import { assistantCoreDependencyFor } from "./writer.js";

const generatorRoot = process.cwd();
const tempRoot = resolve(generatorRoot, ".generated-to-output-test");
const outputRoot = resolve(tempRoot, "nested", "frontend");
const assistantCoreRoot = resolve(tempRoot, "dependencies", "assistant-core");
const { assistantCoreDependency: _assistantCoreDependency, ...input } = frontendFixture;
void _assistantCoreDependency;

describe("generateFrontendToOutput", () => {
  it("escribe una dependencia dinámica portable y el panel del asistente", async () => {
    try {
      await generateFrontendToOutput(input, outputRoot, assistantCoreRoot);
      const packageJson = JSON.parse(await readFile(resolve(outputRoot, "package.json"), "utf8")) as { dependencies: Record<string, string> };
      const assistantPanel = await readFile(resolve(outputRoot, "app", "assistant-panel.tsx"), "utf8");

      expect(packageJson.dependencies["@examen-sw1/assistant-core"]).toBe(assistantCoreDependencyFor(outputRoot, assistantCoreRoot));
      expect(packageJson.dependencies["@examen-sw1/assistant-core"]).toMatch(/^file:[^\\]+$/);
      expect(packageJson.dependencies["@examen-sw1/assistant-core"]).not.toContain(outputRoot);
      expect(packageJson.dependencies["@examen-sw1/assistant-core"]).not.toContain(assistantCoreRoot);
      expect(assistantPanel).toContain("executeAssistantCommand");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
