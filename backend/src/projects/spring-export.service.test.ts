import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalUmlModel } from "@examen-sw1/uml-core";
import { SpringExportError, SpringExportService, zipGeneratedFiles } from "./spring-export.service";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function rolModel(): CanonicalUmlModel {
  return {
    packages: [], enumerations: [], relationships: [],
    classes: [{ id: "33333333-3333-4333-8333-333333333333", name: "Rol", visibility: "public", operations: [], generationMetadata: { entity: true }, attributes: [
      { id: "44444444-4444-4444-8444-444444444444", name: "id", visibility: "private", type: { kind: "primitive", name: "integer" }, generationMetadata: { identifier: true } },
      { id: "55555555-5555-4555-8555-555555555555", name: "nombre", visibility: "private", type: { kind: "primitive", name: "string" }, generationMetadata: { required: true } },
    ] }],
  };
}

function service(uml: CanonicalUmlModel | null = rolModel()) {
  const findProject = vi.fn().mockResolvedValue(uml ? { document: { uml, layout: { elements: [{ id: "visual-only" }] } } } : null);
  const requireView = vi.fn().mockResolvedValue("VIEWER");
  return { service: new SpringExportService({ findProject } as never, { requireView } as never), findProject, requireView };
}

describe("SpringExportService", () => {
  it("genera un ZIP desde document.uml, sin consumir DiagramLayout", async () => {
    const { service: exporter, findProject, requireView } = service();
    const result = await exporter.exportProject(projectId, userId, "com.example.rol");
    const files = unzipSync(result.zip);

    expect(requireView).toHaveBeenCalledWith(projectId, userId);
    expect(findProject).toHaveBeenCalledWith(projectId);
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      "build.gradle", "settings.gradle",
      "src/main/java/com/example/rol/entities/Rol.java",
      "src/main/java/com/example/rol/repositories/RolRepository.java",
      "src/main/java/com/example/rol/services/RolService.java",
      "src/main/java/com/example/rol/controllers/RolController.java",
    ]));
    expect(strFromU8(files["src/main/java/com/example/rol/entities/Rol.java"]!)).toContain("class Rol");
  });

  it("rechaza proyecto inexistente, modelo vacío e inválido antes de entregar un ZIP", async () => {
    const missing = service(null).service;
    await expect(missing.exportProject(projectId, userId)).rejects.toBeInstanceOf(NotFoundException);

    const withoutDocument = new SpringExportService({ findProject: vi.fn().mockResolvedValue({ document: undefined }) } as never, { requireView: vi.fn().mockResolvedValue("OWNER") } as never);
    await expect(withoutDocument.exportProject(projectId, userId)).rejects.toBeInstanceOf(UnprocessableEntityException);

    const empty = service({ packages: [], enumerations: [], relationships: [], classes: [] }).service;
    await expect(empty.exportProject(projectId, userId)).rejects.toBeInstanceOf(UnprocessableEntityException);

    const invalid = service({ packages: [], enumerations: [], relationships: [], classes: [{}] } as unknown as CanonicalUmlModel).service;
    await expect(invalid.exportProject(projectId, userId)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("no carga el documento cuando la persona no tiene acceso de lectura", async () => {
    const findProject = vi.fn();
    const requireView = vi.fn().mockRejectedValue(new ForbiddenException());
    const exporter = new SpringExportService({ findProject } as never, { requireView } as never);

    await expect(exporter.exportProject(projectId, userId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findProject).not.toHaveBeenCalled();
  });

  it("rechaza paquetes base peligrosos y rutas ZIP inseguras", async () => {
    const { service: exporter } = service();
    await expect(exporter.exportProject(projectId, userId, "../unsafe")).rejects.toBeInstanceOf(BadRequestException);
    expect(() => zipGeneratedFiles([{ path: "../escape.java", content: "x" }])).toThrow(SpringExportError);
    expect(() => zipGeneratedFiles([{ path: "C:/escape.java", content: "x" }])).toThrow(SpringExportError);
    expect(() => zipGeneratedFiles([{ path: "safe\\escape.java", content: "x" }])).toThrow(SpringExportError);
  });
});
