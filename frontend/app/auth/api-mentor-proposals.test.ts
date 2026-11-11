import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, type MentorProposalResponse } from "./api";

const PROPOSAL_ID = "00000000-0000-4000-8000-0000000000c1";
const json = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const PENDING: MentorProposalResponse = {
  id: PROPOSAL_ID,
  status: "PENDING",
  baseRevision: 10,
  operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
  preview: { valid: true, diff: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], diagnostics: [] },
  createdAt: "2026-11-10T12:00:00.000Z",
};

function clientWith(response: unknown = json(200, PENDING)) {
  const fetcher = vi.fn().mockResolvedValue(response);
  return { client: createApiClient({ getToken: () => "secret-token", onUnauthorized: vi.fn(), fetcher, apiBaseUrl: "http://api.test" }), fetcher };
}
const call = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls[0] as [string, RequestInit];

describe("cliente API: propuestas del Mentor (CU-2P-06)", () => {
  it("crear envía solo { instruction } a la ruta del proyecto, con JWT", async () => {
    const { client, fetcher } = clientWith(json(201, PENDING));
    await expect(client.createMentorProposal("project id", "Agrega el atributo teléfono de tipo String a Cliente")).resolves.toEqual(PENDING);

    const [url, init] = call(fetcher);
    expect(url).toBe("http://api.test/projects/project%20id/mentor/proposals");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ instruction: "Agrega el atributo teléfono de tipo String a Cliente" }));
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it.each([
    ["applyMentorProposal", "/apply"],
    ["rejectMentorProposal", "/reject"],
  ] as const)("%s hace POST sin cuerpo: ni comando, ni revisión base, ni operación, ni IDs UML", async (method, suffix) => {
    const { client, fetcher } = clientWith();
    await client[method]("p1", PROPOSAL_ID);

    const [url, init] = call(fetcher);
    expect(url).toBe(`http://api.test/projects/p1/mentor/proposals/${PROPOSAL_ID}${suffix}`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("Content-Type")).toBeNull();
  });

  it("detalle hace GET de la propuesta del proyecto", async () => {
    const { client, fetcher } = clientWith();
    await client.getMentorProposal("p1", PROPOSAL_ID);

    const [url, init] = call(fetcher);
    expect(url).toBe(`http://api.test/projects/p1/mentor/proposals/${PROPOSAL_ID}`);
    expect(init.method).toBeUndefined();
  });

  it("conserva el código de dominio y solo los diagnósticos públicos bien formados", async () => {
    const { client } = clientWith(json(422, {
      statusCode: 422,
      error: "Unprocessable Entity",
      code: "INVALID_PROPOSAL",
      message: "La propuesta no supera la validación del modelo UML.",
      diagnostics: [{ code: "DUPLICATE_ATTRIBUTE_NAME", severity: "error", message: "El atributo ya existe.", path: "uml.classes[0]" }, { code: 1 }, "x"],
    }));
    const error = await client.createMentorProposal("p1", "x").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "INVALID_PROPOSAL", diagnostics: [{ code: "DUPLICATE_ATTRIBUTE_NAME", severity: "error", message: "El atributo ya existe." }] });
  });

  it("un error sin código de dominio mantiene solo el status (503, 404 estándar)", async () => {
    const unavailable = await clientWith(json(503, { statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." })).client.createMentorProposal("p1", "x").catch((cause: unknown) => cause);
    expect(unavailable).toMatchObject({ status: 503, code: undefined, diagnostics: [] });
  });
});
