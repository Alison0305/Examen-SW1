import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, type UmlAnalysisFocus, type UmlAnalysisResponse } from "./api";

const CLASS_ID = "550e8400-e29b-41d4-a716-446655440000";
const RELATIONSHIP_ID = "550e8400-e29b-41d4-a716-446655440001";
const json = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const RESPONSE: UmlAnalysisResponse = {
  projectRevision: 4,
  focus: { kind: "class", id: CLASS_ID, name: "Cliente" },
  analysis: {
    facts: { uml: { classes: [] }, relational: { derivable: true } },
    diagnostics: { uml: [], relational: [] },
    conflicts: [],
    limitations: { unsupportedFeatures: [], editor: [], schema: [] },
    summary: { hasUmlErrors: false, hasRelationalErrors: false, relationalDerivable: true },
  },
  explanation: { text: "Cliente realiza 0..* Pedido.", contextTruncation: { truncated: false, omitted: { classes: 0, enumerations: 0, relationships: 0, attributes: 0, diagnostics: 0, limitations: 0 } } },
};

function clientWith(response: unknown = json(200, RESPONSE), onUnauthorized = vi.fn()) {
  const fetcher = vi.fn().mockResolvedValue(response);
  return { client: createApiClient({ getToken: () => "secret-token", onUnauthorized, fetcher, apiBaseUrl: "http://api.test" }), fetcher, onUnauthorized };
}
const sentBody = (fetcher: ReturnType<typeof vi.fn>) => JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string) as unknown;

describe("cliente API: análisis UML (CU-2P-04)", () => {
  it("A-01: una clase envía solo { focus: { kind, id } } a la ruta del proyecto, con JWT", async () => {
    const { client, fetcher } = clientWith();
    await client.analyzeUml("project id", { kind: "class", id: CLASS_ID });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/projects/project%20id/mentor/analysis");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ focus: { kind: "class", id: CLASS_ID } }));
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret-token");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("A-02: una relación envía su foco", async () => {
    const { client, fetcher } = clientWith();
    await client.analyzeUml("p1", { kind: "relationship", id: RELATIONSHIP_ID });
    expect(sentBody(fetcher)).toEqual({ focus: { kind: "relationship", id: RELATIONSHIP_ID } });
  });

  it("A-03: el modelo completo envía un foco sin id", async () => {
    const { client, fetcher } = clientWith();
    await client.analyzeUml("p1", { kind: "model" });
    expect((fetcher.mock.calls[0]![1] as RequestInit).body).toBe(JSON.stringify({ focus: { kind: "model" } }));
  });

  it("A-04: no envía usuario, UML, revisión, pregunta ni propiedades ajenas aunque el objeto las traiga", async () => {
    const { client, fetcher } = clientWith();
    const polluted = { kind: "class", id: CLASS_ID, name: "Cliente", userId: "otro", revision: 9, question: "¿?", uml: { classes: [] } } as UmlAnalysisFocus;

    await client.analyzeUml("p1", polluted);

    expect(sentBody(fetcher)).toEqual({ focus: { kind: "class", id: CLASS_ID } });
    const raw = (fetcher.mock.calls[0]![1] as RequestInit).body as string;
    for (const leaked of ["userId", "revision", "question", "uml", "name"]) expect(raw).not.toContain(leaked);
  });

  it("A-05: devuelve la respuesta del backend sin transformarla", async () => {
    const { client } = clientWith();
    await expect(client.analyzeUml("p1", { kind: "class", id: CLASS_ID })).resolves.toEqual(RESPONSE);
  });

  it("A-06: un 503 se propaga como ApiError con el mensaje seguro del backend; un 401 avisa a la sesión", async () => {
    const unavailable = clientWith(json(503, { statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." }));
    const error = await unavailable.client.analyzeUml("p1", { kind: "model" }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, message: "El Mentor IA no está disponible en este momento." });

    const expired = clientWith(json(401, { statusCode: 401, message: "Unauthorized" }));
    await expect(expired.client.analyzeUml("p1", { kind: "model" })).rejects.toMatchObject({ status: 401 });
    expect(expired.onUnauthorized).toHaveBeenCalledOnce();
  });
});
