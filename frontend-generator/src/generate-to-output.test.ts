import { access, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { frontendFixture } from "./frontend-fixture.js";
import { generateFrontendToOutput, generateStandaloneCrudFrontendToOutput } from "./generate-to-output.js";
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
  it("escribe el perfil standalone sin artefactos del asistente", async () => {
    try {
      await generateStandaloneCrudFrontendToOutput({ relationalModel: frontendFixture.relationalModel, domainManifest: frontendFixture.domainManifest }, outputRoot);
      const packageJson = await readFile(resolve(outputRoot, "package.json"), "utf8");
      await Promise.all(["app/page.tsx", "app/api.ts", "app/domain.ts", "app/layout.tsx"].map((path) => access(resolve(outputRoot, path))));
      expect(packageJson).not.toContain("assistant-core"); expect(packageJson).not.toContain("file:");
      await expect(access(resolve(outputRoot, "app/assistant-panel.tsx"))).rejects.toThrow(); await expect(access(resolve(outputRoot, "app/voice-transcript-input.tsx"))).rejects.toThrow(); await expect(access(resolve(outputRoot, "app/lan-config.ts"))).rejects.toThrow();
    } finally { await rm(tempRoot, { recursive: true, force: true }); }
  });
});
