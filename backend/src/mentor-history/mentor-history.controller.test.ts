import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/auth.types";
import type { MentorHistoryListResult, MentorHistoryPage, MentorHistoryQueryError, MentorProposalHistoryList, MentorProposalHistoryListResult } from "./mentor-history.contracts";
import { MentorHistoryController } from "./mentor-history.controller";
import type { MentorHistoryProposalsService } from "./mentor-history-proposals.service";
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
  return { controller: new MentorHistoryController({ list } as unknown as MentorHistoryService, {} as unknown as MentorHistoryProposalsService), list };
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

// Task 8.1: GET :id/mentor/history/proposals. The proposals service is a double; the controller must behave exactly
// like the interaction route: trusted ids, raw query, unwrapped list, query error → 400, everything else untouched.
const PROPOSALS: MentorProposalHistoryList = {
  items: [{ proposalId: "d7035000-0000-4000-8000-0000000000d1", status: "PENDING", operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } }, summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], baseRevision: 4, createdAt: "2026-11-10T09:00:00.000Z" }],
};

function proposalControllerWith(behaviour: MentorProposalHistoryListResult | Error) {
  const history = vi.fn();
  const list = vi.fn(async (...args: Parameters<MentorHistoryProposalsService["list"]>) => {
    void args;
    if (behaviour instanceof Error) throw behaviour;
    return behaviour;
  });
  return { controller: new MentorHistoryController({ list: history } as unknown as MentorHistoryService, { list } as unknown as MentorHistoryProposalsService), list, history };
}

describe("MentorHistoryController.listProposals (unitario, tarea 8.1)", () => {
  it("devuelve solo { items } con la proyección de CU-2P-06 tal cual, sin envoltorio ni cursor, y no toca el historial de interacciones", async () => {
    const { controller, history } = proposalControllerWith({ ok: true, list: PROPOSALS });

    const response = await controller.listProposals(authenticated(), PROJECT_ID, {});

    expect(response).toBe(PROPOSALS);
    expect(Object.keys(response)).toEqual(["items"]);
    expect(history).not.toHaveBeenCalled();
  });

  it("pasa el projectId de la ruta, el userId del JWT y la query cruda sin reinterpretarla", async () => {
    const { controller, list } = proposalControllerWith({ ok: true, list: PROPOSALS });
    const rawQuery = { limit: "5", userId: "suplantado" };

    await controller.listProposals(authenticated(), PROJECT_ID, rawQuery);

    expect(list).toHaveBeenCalledExactlyOnceWith(PROJECT_ID, USER_ID, rawQuery);
    expect(list.mock.calls[0]![2]).toBe(rawQuery);
  });

  it("sin authenticatedUser responde 404 sin llamar al servicio", async () => {
    const { controller, list } = proposalControllerWith({ ok: true, list: PROPOSALS });

    await expect(controller.listProposals({} as AuthenticatedRequest, PROJECT_ID, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    { code: "INVALID_LIMIT", message: "limit debe ser un entero entre 1 y 50." },
    { code: "UNKNOWN_PARAMETER", message: "Parámetros no admitidos: cursor." },
  ] as const)("con ok:false $code lanza la misma BadRequestException que el historial de interacciones", async (error) => {
    const { controller } = proposalControllerWith({ ok: false, error });

    const thrown = await controller.listProposals(authenticated(), PROJECT_ID, {}).catch((caught: unknown) => caught);

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getResponse()).toEqual({ statusCode: 400, error: "Bad Request", code: error.code, message: error.message });
  });

  it("propaga la NotFoundException de requireView y los errores inesperados sin transformarlos", async () => {
    const notFound = new NotFoundException();
    await expect(proposalControllerWith(notFound).controller.listProposals(authenticated(), PROJECT_ID, {})).rejects.toBe(notFound);
    const failure = new Error("fallo de infraestructura");
    await expect(proposalControllerWith(failure).controller.listProposals(authenticated(), PROJECT_ID, {})).rejects.toBe(failure);
  });
});
