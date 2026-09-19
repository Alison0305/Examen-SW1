import { describe, expect, it } from "vitest";
import { inspectLocalTextModel, LOCAL_QWEN3_1_7B_SPIKE_CONFIG, parseStructuredAssistantOutput, validateAssistantCommand } from "./index.js";
import type { DomainManifestV1 } from "@examen-sw1/spring-generator";

const manifest: DomainManifestV1 = {
  schemaVersion: 1,
  entities: [{
    name: "usuario",
    resourceName: "usuario",
    attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }],
    relations: [],
    operations: [{ name: "listUsuario", method: "GET", path: "/api/v1/usuario" }],
  }],
};

describe("spike local de Qwen3", () => {
  it("no descarga ni carga un modelo inexistente", () => {
    let inspectedPath: string | undefined;
    const result = inspectLocalTextModel({ ...LOCAL_QWEN3_1_7B_SPIKE_CONFIG, modelPath: "models/qwen3-1.7b.gguf" }, (path) => {
      inspectedPath = path;
      return false;
    });

    expect(result.status).toBe("MODEL_NOT_FOUND");
    expect(inspectedPath).toBe("models/qwen3-1.7b.gguf");
  });

  it("distingue la ausencia de configuración y no declara proveedor remoto", () => {
    expect(inspectLocalTextModel(LOCAL_QWEN3_1_7B_SPIKE_CONFIG).status).toBe("NOT_CONFIGURED");
    expect(LOCAL_QWEN3_1_7B_SPIKE_CONFIG).toMatchObject({ runtime: "node-llama-cpp", provider: "none", model: { family: "Qwen3", parameters: "1.7B", quantized: true, format: "GGUF" } });
  });

  it("acepta únicamente un fixture estructurado y conserva la validación determinista", () => {
    const fixture = { operation: "LIST", entity: "usuario" };
    const parsed = parseStructuredAssistantOutput(fixture);

    expect(parsed).toEqual({ ok: true, command: fixture });
    if (parsed.ok) expect(validateAssistantCommand(parsed.command, manifest).ok).toBe(true);
    expect(parseStructuredAssistantOutput({ ...fixture, url: "https://example.test" })).toMatchObject({ ok: false, status: "INVALID_OUTPUT" });
  });
});
