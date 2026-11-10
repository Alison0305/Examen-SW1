import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, type MentorHistoryPage, type MentorHistoryParams } from "./api";

const PROJECT_ID = "d7035000-0000-4000-8000-0000000000b1";
const PAGE: MentorHistoryPage = {
  items: [{ id: "d7035000-0000-4000-8000-0000000000c1", author: { email: "owner@example.test" }, question: "¿Qué es Cliente?", answer: "Una clase.", occurredAt: "2026-11-10T12:00:00.000Z" }],
  nextCursor: "eyJ2IjoxfQ",
};
const json = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function clientWith(response: unknown = json(200, PAGE), onUnauthorized = vi.fn()) {
  const fetcher = vi.fn().mockResolvedValue(response);
  return { client: createApiClient({ getToken: () => "secret-token", onUnauthorized, fetcher, apiBaseUrl: "http://api.test" }), fetcher, onUnauthorized };
}
const urlOf = (fetcher: ReturnType<typeof vi.fn>, call = 0) => new URL(fetcher.mock.calls[call]![0] as string);
const initOf = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls[0]![1] as RequestInit;

describe("cliente API: historial compartido del Mentor (CU-2P-07)", () => {
  it("H-01: sin parámetros hace GET a la ruta del proyecto, sin query, sin cuerpo y con JWT", async () => {
    const { client, fetcher } = clientWith();

    await expect(client.getMentorHistory(PROJECT_ID)).resolves.toEqual(PAGE);

    expect(fetcher.mock.calls[0]![0]).toBe(`http://api.test/projects/${PROJECT_ID}/mentor/history`);
    expect(initOf(fetcher).method).toBeUndefined();
    expect(initOf(fetcher).body).toBeUndefined();
    expect(new Headers(initOf(fetcher).headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it("H-02: un objeto vacío tampoco añade query", async () => {
    const { client, fetcher } = clientWith();
    await client.getMentorHistory(PROJECT_ID, {});
    expect(urlOf(fetcher).search).toBe("");
  });

  it.each<[string, MentorHistoryParams, Record<string, string>]>([
    ["limit", { limit: 20 }, { limit: "20" }],
    ["q", { q: "uml" }, { q: "uml" }],
    ["cursor", { cursor: "abc_-123" }, { cursor: "abc_-123" }],
    ["q + cursor", { cursor: "abc", q: "uml" }, { cursor: "abc", q: "uml" }],
    ["limit + cursor + q", { limit: 5, cursor: "abc", q: "uml" }, { limit: "5", cursor: "abc", q: "uml" }],
  ])("H-03: %s envía solo esos parámetros", async (_label, params, expected) => {
    const { client, fetcher } = clientWith();
    await client.getMentorHistory(PROJECT_ID, params);
    expect(Object.fromEntries(urlOf(fetcher).searchParams)).toEqual(expected);
  });

  it("H-04: codifica la búsqueda y el cursor (acentos, espacios, %, +, &, #) y recorta q", async () => {
    const { client, fetcher } = clientWith();
    await client.getMentorHistory(PROJECT_ID, { q: "  relación 100% a+b&c=d#e  ", cursor: "x/y+z=" });

    const url = urlOf(fetcher);
    expect(url.searchParams.get("q")).toBe("relación 100% a+b&c=d#e");
    expect(url.searchParams.get("cursor")).toBe("x/y+z=");
    expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "q"]);
    expect(url.hash).toBe("");
  });

  it.each(["", "   ", "\t"])("H-05: una búsqueda vacía o en blanco (%j) no envía q", async (q) => {
    const { client, fetcher } = clientWith();
    await client.getMentorHistory(PROJECT_ID, { q });
    expect(urlOf(fetcher).searchParams.has("q")).toBe(false);
    expect(fetcher.mock.calls[0]![0]).not.toContain("q=");
  });

  it("H-06: el projectId va solo en la ruta, codificado; nunca userId, projectId, offset ni otros campos", async () => {
    const { client, fetcher } = clientWith();
    const polluted = { q: "uml", userId: "otro", projectId: "ajeno", offset: 40, prompt: "x", uml: {} } as MentorHistoryParams;

    await client.getMentorHistory("project id", polluted);

    const url = urlOf(fetcher);
    expect(url.pathname).toBe("/projects/project%20id/mentor/history");
    expect([...url.searchParams.keys()]).toEqual(["q"]);
    expect(url.search).toBe("?q=uml");
    for (const leaked of ["userId", "projectId", "offset", "prompt", "uml="]) expect(url.search).not.toContain(leaked);
  });

  it("H-07: una búsqueda nueva sin cursor no arrastra el cursor de la anterior (el cliente no guarda estado)", async () => {
    const { client, fetcher } = clientWith();
    await client.getMentorHistory(PROJECT_ID, { q: "UML", cursor: "abc" });
    await client.getMentorHistory(PROJECT_ID, { q: "Prisma" });

    expect(Object.fromEntries(urlOf(fetcher, 1).searchParams)).toEqual({ q: "Prisma" });
  });

  it.each([400, 404, 500, 503])("H-08: un %i se convierte en ApiError con su estado", async (status) => {
    const { client } = clientWith(json(status, { statusCode: status, message: "detalle" }));
    await expect(client.getMentorHistory(PROJECT_ID)).rejects.toEqual(expect.objectContaining({ status }));
    await expect(client.getMentorHistory(PROJECT_ID)).rejects.toBeInstanceOf(ApiError);
  });

  it("H-09: un 401 usa el manejo global de sesión (onUnauthorized) y lanza ApiError 401", async () => {
    const { client, onUnauthorized } = clientWith(json(401, { statusCode: 401, message: "Unauthorized" }));

    await expect(client.getMentorHistory(PROJECT_ID)).rejects.toEqual(expect.objectContaining({ status: 401 }));
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
