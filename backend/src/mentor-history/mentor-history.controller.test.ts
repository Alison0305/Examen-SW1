import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/auth.types";
import type { MentorHistoryListResult, MentorHistoryPage, MentorHistoryQueryError } from "./mentor-history.contracts";
import { MentorHistoryController } from "./mentor-history.controller";
import type { MentorHistoryService } from "./mentor-history.service";

// CU-2P-07, fase 4: MentorHistoryController in isolation. The service is a double; the controller must only pass the
// trusted ids and the raw query, unwrap the success page, map the query error to 400 and let everything else through.

const PROJECT_ID = "d7035000-0000-4000-8000-0000000000b1";
const USER_ID = "d7035000-0000-4000-8000-0000000000a3";
const PAGE: MentorHistoryPage = {
  items: [{ id: "d7035000-0000-4000-8000-0000000000c1", author: { email: "owner@example.test" }, question: "Q1", answer: "R1", occurredAt: "2026-11-10T09:00:00.000Z" }],
  nextCursor: "opaque-cursor",
};

function controllerWith(behaviour: MentorHistoryListResult | Error) {
  const list = vi.fn(async (...args: Parameters<MentorHistoryService["list"]>) => {
    void args;
    if (behaviour instanceof Error) throw behaviour;
    return behaviour;
  });
  return { controller: new MentorHistoryController({ list } as unknown as MentorHistoryService), list };
}

const authenticated = (id = USER_ID) => ({ authenticatedUser: { id, email: "viewer@example.test" } }) as unknown as AuthenticatedRequest;

describe("MentorHistoryController (unitario)", () => {
  it("con ok:true devuelve solo la página, sin el envoltorio interno del servicio", async () => {
    const { controller } = controllerWith({ ok: true, page: PAGE });

    const response = await controller.list(authenticated(), PROJECT_ID, {});

    expect(response).toBe(PAGE);
    expect(response).not.toHaveProperty("ok");
    expect(response).not.toHaveProperty("page");
  });

  it("pasa el projectId de la ruta, el userId del usuario autenticado y la query cruda sin reinterpretarla", async () => {
    const { controller, list } = controllerWith({ ok: true, page: PAGE });
    const rawQuery = { limit: ["10", "20"], q: "  uml  ", userId: "suplantado", cursor: "x" };

    await controller.list(authenticated(), PROJECT_ID, rawQuery);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(PROJECT_ID, USER_ID, rawQuery);
    // Same object, untouched: no trimming, no array collapsing, no removal of unknown keys.
    expect(list.mock.calls[0]![2]).toBe(rawQuery);
    expect(rawQuery).toEqual({ limit: ["10", "20"], q: "  uml  ", userId: "suplantado", cursor: "x" });
  });

  it("sin authenticatedUser responde 404 sin llamar al servicio (defensa igual que MentorController)", async () => {
    const { controller, list } = controllerWith({ ok: true, page: PAGE });

    await expect(controller.list({} as AuthenticatedRequest, PROJECT_ID, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(list).not.toHaveBeenCalled();
  });

  const queryErrors: ReadonlyArray<[MentorHistoryQueryError, Record<string, unknown>]> = [
    [{ code: "INVALID_CURSOR", reason: "MALFORMED_CURSOR", message: "El cursor del historial no es válido." }, { reason: "MALFORMED_CURSOR" }],
    [{ code: "INVALID_CURSOR", reason: "UNSUPPORTED_CURSOR_VERSION", message: "El cursor del historial no es válido." }, { reason: "UNSUPPORTED_CURSOR_VERSION" }],
    [{ code: "INVALID_CURSOR", reason: "INVALID_CURSOR_DATE", message: "El cursor del historial no es válido." }, { reason: "INVALID_CURSOR_DATE" }],
    [{ code: "INVALID_CURSOR", reason: "INVALID_CURSOR_ID", message: "El cursor del historial no es válido." }, { reason: "INVALID_CURSOR_ID" }],
    [{ code: "INVALID_LIMIT", message: "limit debe ser un entero entre 1 y 50." }, {}],
    [{ code: "INVALID_SEARCH", message: "La búsqueda debe contener entre 1 y 200 caracteres sin caracteres de control." }, {}],
    [{ code: "UNKNOWN_PARAMETER", message: "Parámetros no admitidos: userId." }, {}],
  ];

  it.each(queryErrors)("con ok:false %j lanza BadRequestException con el código estable", async (error, extra) => {
    const { controller } = controllerWith({ ok: false, error });

    const thrown = await controller.list(authenticated(), PROJECT_ID, {}).catch((caught: unknown) => caught);

    expect(thrown).toBeInstanceOf(BadRequestException);
    const body = (thrown as BadRequestException).getResponse();
    expect(body).toEqual({ statusCode: 400, error: "Bad Request", code: error.code, ...extra, message: error.message });
    if (error.code !== "INVALID_CURSOR") expect(body).not.toHaveProperty("reason");
  });

  it("no captura ni transforma la NotFoundException de requireView", async () => {
    const notFound = new NotFoundException();
    const { controller } = controllerWith(notFound);

    await expect(controller.list(authenticated(), PROJECT_ID, {})).rejects.toBe(notFound);
  });

  it("propaga un error inesperado tal cual: ni 400 ni página vacía", async () => {
    const failure = new Error("fallo de infraestructura");
    const { controller } = controllerWith(failure);

    const thrown = await controller.list(authenticated(), PROJECT_ID, {}).catch((caught: unknown) => caught);

    expect(thrown).toBe(failure);
    expect(thrown).not.toBeInstanceOf(HttpException);
  });
});
