import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const templateDirectory = join(dirname(fileURLToPath(import.meta.url)), "templates");
const readTemplate = (name: string): string => readFileSync(join(templateDirectory, `${name}.hbs`), "utf8");
export const templates = Object.freeze({ package: readTemplate("package"), standalonePackage: readTemplate("standalone-package"), layout: readTemplate("layout"), page: readTemplate("page"), standalonePage: readTemplate("standalone-page"), api: readTemplate("api"), assistantPanel: readTemplate("assistant-panel"), voiceTranscriptInput: readTemplate("voice-transcript-input"), lanConfig: readTemplate("lan-config"), capacitorConfig: readTemplate("capacitor-config"), androidSetup: readTemplate("configure-android.mjs"), gitignore: readTemplate("gitignore"), domain: readTemplate("domain"), config: readTemplate("next-config"), tsconfig: readTemplate("tsconfig"), envExample: readTemplate("env-example") });
