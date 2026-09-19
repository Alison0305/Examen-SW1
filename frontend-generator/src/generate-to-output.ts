import type { FrontendGeneratorInput } from "./model.js";
import { generateFrontend } from "./generator.js";
import { assistantCoreDependencyFor, validateGeneratedFiles, writeGeneratedFiles } from "./writer.js";

/** Generates and atomically writes a frontend with its output-relative assistant dependency. */
export async function generateFrontendToOutput(
  input: Omit<FrontendGeneratorInput, "assistantCoreDependency">,
  outputRoot: string,
  assistantCoreRoot: string,
): Promise<void> {
  const files = generateFrontend({ ...input, assistantCoreDependency: assistantCoreDependencyFor(outputRoot, assistantCoreRoot) });
  validateGeneratedFiles(files);
  await writeGeneratedFiles(outputRoot, files);
}
