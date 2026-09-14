import { readFileSync } from "node:fs";

const readTemplate = (name: string): string => readFileSync(new URL(`./templates/${name}.hbs`, import.meta.url), "utf8");

export const templates = Object.freeze({
  settings: readTemplate("settings"), build: readTemplate("build"), properties: readTemplate("application-properties"), application: readTemplate("application"),
  enumeration: readTemplate("enumeration"), entity: readTemplate("entity"), repository: readTemplate("repository"), service: readTemplate("service"), controller: readTemplate("controller"),
});
