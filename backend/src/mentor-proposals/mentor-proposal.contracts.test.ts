import type { UmlCommand } from "@examen-sw1/uml-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isSupportedMentorProposalOperation,
  MENTOR_PROPOSAL_DIFF_ELEMENTS,
  MENTOR_PROPOSAL_DIFF_KINDS,
  MENTOR_PROPOSAL_ERROR_CODES,
  MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH,
  MENTOR_PROPOSAL_OPERATIONS,
  MENTOR_PROPOSAL_STATUSES,
  type CreateMentorProposalRequest,
  type MentorProposalCommand,
  type MentorProposalDiagnostic,
  type MentorProposalDiffLine,
  type MentorProposalHistoryProjection,
  type MentorProposalIntent,
  type MentorProposalOperationKind,
  type MentorProposalResponse,
  type MentorProposalStatus,
} from "./mentor-proposal.contracts";

describe("allow-list de operaciones", () => {
  it("v1 admite solo ADD_ATTRIBUTE", () => {
    expect(MENTOR_PROPOSAL_OPERATIONS).toEqual(["ADD_ATTRIBUTE"]);
    expect(isSupportedMentorProposalOperation("ADD_ATTRIBUTE")).toBe(true);
  });

  it("rechaza operaciones fuera de la allow-list y valores no textuales", () => {
    for (const value of ["CREATE_CLASS", "DELETE_CLASS", "RENAME_CLASS", "UPDATE_ATTRIBUTE", "UPDATE_MULTIPLICITY", "CREATE_RELATIONSHIP", "DELETE_RELATIONSHIP", "add_attribute", "AddAttribute", "", " ADD_ATTRIBUTE"]) {
      expect(isSupportedMentorProposalOperation(value)).toBe(false);
    }
    for (const value of [undefined, null, 1, {}, ["ADD_ATTRIBUTE"]]) {
      expect(isSupportedMentorProposalOperation(value)).toBe(false);
    }
  });

  it("la intención está discriminada por la misma allow-list", () => {
    expectTypeOf<MentorProposalIntent["operation"]>().toEqualTypeOf<MentorProposalOperationKind>();
    expectTypeOf<MentorProposalResponse["operation"]["kind"]>().toEqualTypeOf<MentorProposalOperationKind>();
  });
});

describe("estados", () => {
  it("persiste solo PENDING, APPLIED y REJECTED; STALE no es un estado", () => {
    expect(MENTOR_PROPOSAL_STATUSES).toEqual(["PENDING", "APPLIED", "REJECTED"]);
    expect(MENTOR_PROPOSAL_STATUSES).not.toContain("STALE");
    expectTypeOf<MentorProposalStatus>().toEqualTypeOf<"PENDING" | "APPLIED" | "REJECTED">();
  });
});

describe("solicitud de creación", () => {
  it("solo contiene la instrucción, con máximo de 500 caracteres", () => {
    expect(MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH).toBe(500);
    expectTypeOf<keyof CreateMentorProposalRequest>().toEqualTypeOf<"instruction">();
  });
});

describe("intención frente a comando resuelto", () => {
  it("la intención generada no contiene identificadores", () => {
    expectTypeOf<keyof MentorProposalIntent>().toEqualTypeOf<"operation" | "className" | "attributeName" | "attributeType" | "multiplicity">();
    expectTypeOf<MentorProposalIntent>().not.toHaveProperty("classId");
    expectTypeOf<MentorProposalIntent>().not.toHaveProperty("attributeId");
    expectTypeOf<MentorProposalIntent>().not.toHaveProperty("id");
  });

  it("el comando resuelto es exactamente un UmlCommand AddAttribute con attributeId fijado por el servidor", () => {
    expectTypeOf<MentorProposalCommand>().toMatchTypeOf<UmlCommand>();
    expectTypeOf<MentorProposalCommand["type"]>().toEqualTypeOf<"AddAttribute">();
    expectTypeOf<MentorProposalCommand["attributeId"]>().toEqualTypeOf<string>();
    const command: MentorProposalCommand = {
      type: "AddAttribute",
      classId: "00000000-0000-4000-8000-000000000001",
      attributeId: "00000000-0000-4000-8000-000000000002",
      name: "telefono",
      attributeType: { kind: "primitive", name: "string" },
    };
    expect(command.attributeId).toBeTruthy();
  });
});

describe("respuesta pública", () => {
  it("no expone el comando persistido ni datos internos", () => {
    expectTypeOf<keyof MentorProposalResponse>().toEqualTypeOf<"id" | "status" | "baseRevision" | "operation" | "preview" | "createdAt" | "resolvedAt" | "resultingRevision">();
    expectTypeOf<MentorProposalResponse>().not.toHaveProperty("command");
    expectTypeOf<MentorProposalResponse>().not.toHaveProperty("authorUserId");
    expectTypeOf<MentorProposalResponse>().not.toHaveProperty("instruction");
    expectTypeOf<MentorProposalResponse["operation"]["target"]>().not.toHaveProperty("classId");
  });

  it("los diagnósticos públicos no llevan path ni elementId", () => {
    expectTypeOf<keyof MentorProposalDiagnostic>().toEqualTypeOf<"code" | "severity" | "message">();
  });
});

describe("diff", () => {
  it("tiene vocabulario estable aunque v1 solo produzca atributos", () => {
    expect(MENTOR_PROPOSAL_DIFF_KINDS).toEqual(["added", "removed", "changed"]);
    expect(MENTOR_PROPOSAL_DIFF_ELEMENTS).toEqual(["class", "attribute", "relationship", "enumeration"]);
    const line: MentorProposalDiffLine = { kind: "added", element: "attribute", label: "Cliente.telefono: string" };
    expect(line).toEqual({ kind: "added", element: "attribute", label: "Cliente.telefono: string" });
  });
});

describe("errores de dominio", () => {
  it("define los códigos estables mínimos", () => {
    expect(MENTOR_PROPOSAL_ERROR_CODES).toEqual(["INVALID_PROPOSAL", "UNSUPPORTED_OPERATION", "ELEMENT_NOT_FOUND", "UNKNOWN_TYPE", "STALE_PROPOSAL", "PROPOSAL_ALREADY_APPLIED", "PROPOSAL_REJECTED"]);
  });
});

describe("proyección futura para CU-2P-07", () => {
  it("solo expone estado y resumen, sin operación ni comando", () => {
    expectTypeOf<keyof MentorProposalHistoryProjection>().toEqualTypeOf<"proposalId" | "status" | "summary" | "createdAt" | "resolvedAt">();
  });
});
