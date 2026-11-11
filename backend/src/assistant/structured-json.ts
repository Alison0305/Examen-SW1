function objectCandidates(text: string): string[] | undefined {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}") {
      if (depth === 0) return undefined;
      depth -= 1;
      if (depth === 0) candidates.push(text.slice(start, index + 1));
    }
  }
  return depth === 0 && !inString ? candidates : undefined;
}

// Qwen may surround its JSON with thought tags, a Markdown fence, or prose.
// This extracts only one complete JSON object; it never supplies missing fields.
export function parseSingleJsonObject(value: string): Record<string, unknown> | undefined {
  let text = value.trim();
  while (text.startsWith("<think>")) {
    const end = text.indexOf("</think>");
    if (end < 0) return undefined;
    text = text.slice(end + "</think>".length).trim();
  }
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n?```$/i.exec(text);
  if (fenced) text = fenced[1]!.trim();
  if (text.startsWith("[")) return undefined;

  const candidates = objectCandidates(text);
  if (!candidates || candidates.length !== 1) return undefined;
  try {
    const parsed: unknown = JSON.parse(candidates[0]!);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}
