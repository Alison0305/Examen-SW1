import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./api";

const proposal = { source: "image", classes: [], enumerations: [], relationships: [], diagnostics: [] };
const json = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

describe("cliente API: reconocimiento de imagen", () => {
  it("envía la imagen como cuerpo binario con JWT y devuelve la propuesta", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(200, { ok: true, proposal, image: { width: 800, height: 400 }, ocrLines: 5, elapsedMs: 6400 }));
    const client = createApiClient({ getToken: () => "secret-token", onUnauthorized: vi.fn(), fetcher, apiBaseUrl: "http://api.test" });
    const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

    await expect(client.recognizeDiagram("project-1", image)).resolves.toEqual({ proposal, image: { width: 800, height: 400 }, ocrLines: 5, elapsedMs: 6400 });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/projects/project-1/vision/uml-proposal");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(image);
    expect(new Headers(init.headers).get("Content-Type")).toBe("image/jpeg");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it("convierte el diagnóstico estructurado en ApiError y avisa de la sesión vencida", async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(503, { ok: false, diagnostic: { code: "NOT_CONFIGURED", message: "No se configuró un modelo local de visión." } }))
      .mockResolvedValueOnce(json(401, { message: "Unauthorized", statusCode: 401 }))
      .mockResolvedValueOnce({ status: 500, ok: false, json: async () => { throw new Error("html"); } });
    const client = createApiClient({ getToken: () => "token", onUnauthorized, fetcher, apiBaseUrl: "http://api.test" });
    const image = new Blob(["x"], { type: "application/octet-stream" });

    await expect(client.recognizeDiagram("p", image)).rejects.toEqual(new ApiError(503, "No se configuró un modelo local de visión."));
    await expect(client.recognizeDiagram("p", image)).rejects.toMatchObject({ status: 401, message: "Unauthorized" });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    await expect(client.recognizeDiagram("p", image)).rejects.toMatchObject({ status: 500, message: "No fue posible reconocer la imagen." });
    expect(new Headers((fetcher.mock.calls[0] as [string, RequestInit])[1].headers).get("Content-Type")).toBe("application/octet-stream");
  });
});
