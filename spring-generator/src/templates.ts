import { readFileSync } from "node:fs";

const readTemplate = (name: string): string => readFileSync(new URL(`./templates/${name}.hbs`, import.meta.url), "utf8");

export const templates = Object.freeze({
  settings: readTemplate("settings"), build: readTemplate("build"), properties: readTemplate("application-properties"), application: readTemplate("application"),
  enumeration: readTemplate("enumeration"), entity: readTemplate("entity"), repository: readTemplate("repository"), service: readTemplate("service"), controller: readTemplate("controller"), dto: readTemplate("dto"), patchField: readTemplate("patch-field"), pageResponse: readTemplate("page-response"), countResponse: readTemplate("count-response"), responseMapper: readTemplate("response-mapper"), apiError: readTemplate("api-error"), apiException: readTemplate("api-exception"), apiHandler: readTemplate("api-handler"), queryParser: readTemplate("query-parser"), testProperties: readTemplate("application-test-properties"), runtimeTest: readTemplate("runtime-test"),
});
