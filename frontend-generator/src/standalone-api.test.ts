import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { generateStandaloneCrudFrontend } from "./generator.js";
import { frontendFixture } from "./frontend-fixture.js";

async function generatedApi() {
  const source = generateStandaloneCrudFrontend({ relationalModel: frontendFixture.relationalModel, domainManifest: frontendFixture.domainManifest }).find((file) => file.path === "app/api.ts")!.content;
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}#${Math.random()}`);
}

afterEach(() => vi.unstubAllGlobals());

describe("standalone API responses", () => {
  it("acepta 200 vacío, 204, JSON y conserva el error no-OK", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response("error", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const { request } = await generatedApi();
    await expect(request("/venta/1", { method: "DELETE" })).resolves.toBeUndefined();
    await expect(request("/venta/2", { method: "DELETE" })).resolves.toBeUndefined();
    await expect(request("/producto/1")).resolves.toEqual({ id: 1 });
    await expect(request("/producto/1")).rejects.toThrow("No fue posible completar la operación solicitada.");
  });
});
