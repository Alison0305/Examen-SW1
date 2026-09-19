import Handlebars from "handlebars";
import type { FrontendGeneratorInput, GeneratedFile } from "./model.js";
import { deriveMutableFields } from "./mutable-fields.js";
import { templates } from "./templates.js";

const binary = (left: string, right: string): number => left === right ? 0 : left < right ? -1 : 1;
const render = (template: string, view: object): string => Handlebars.compile(template, { noEscape: true })(view).replace(/\r\n/g, "\n");

/** Generates a stable Next.js projection from existing relational and HTTP contracts. */
export function generateFrontend(input: FrontendGeneratorInput): readonly GeneratedFile[] {
  validateInput(input);
  const manifest = { schemaVersion: input.domainManifest.schemaVersion, entities: [...input.domainManifest.entities].sort((left, right) => binary(left.name, right.name)).map((entity) => ({ ...entity, ...deriveMutableFields(entity, input.openApi), attributes: [...entity.attributes].sort((left, right) => binary(left.name, right.name)), relations: [...entity.relations].sort((left, right) => binary(left.name, right.name)), operations: [...entity.operations].sort((left, right) => binary(left.name, right.name)) })) };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const files: GeneratedFile[] = [
    { path: ".env.example", content: render(templates.envExample, {}) },
    { path: "package.json", content: render(templates.package, { assistantCoreDependency: input.assistantCoreDependency }) },
    { path: "tsconfig.json", content: render(templates.tsconfig, {}) },
    { path: "next.config.ts", content: render(templates.config, {}) },
    { path: "app/layout.tsx", content: render(templates.layout, {}) },
    { path: "app/page.tsx", content: render(templates.page, {}) },
    { path: "app/assistant-panel.tsx", content: render(templates.assistantPanel, {}) },
    { path: "app/domain.ts", content: render(templates.domain, { manifestJson }) },
  ].map((file) => Object.freeze(file)).sort((left, right) => binary(left.path, right.path));
  return Object.freeze(files);
}

function validateInput(input: FrontendGeneratorInput): void {
  if (input.domainManifest.schemaVersion !== 1) throw new Error("Solo se admite Domain Manifest v1.");
  if (!input.assistantCoreDependency.startsWith("file:")) throw new Error("assistantCoreDependency debe ser un especificador file:.");
  const tables = new Set(input.relationalModel.tables.map((table) => table.name));
  for (const entity of input.domainManifest.entities) {
    if (!tables.has(entity.name)) throw new Error(`La entidad ${entity.name} no existe en RelationalModel.`);
    for (const operation of entity.operations) {
      const operationId = input.openApi.paths[operation.path]?.[operation.method.toLowerCase()]?.operationId;
      if (operationId !== operation.name) throw new Error(`OpenAPI no verifica ${operation.method} ${operation.path}.`);
    }
  }
}
