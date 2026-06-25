export type TemplateVariableDefinition = {
  id: string;
  name: string;
  format: string;
  outcome: string;
};

export type TemplateVariableValueMap = Record<string, string>;

export const DEFAULT_TEMPLATE_VARIABLES: TemplateVariableDefinition[] = [
  {
    id: "company",
    name: "Company",
    format: "{{company}}",
    outcome: "NC Tile Pros",
  },
  {
    id: "phone",
    name: "Phone",
    format: "{{phone}}",
    outcome: "919.244.9606",
  },
  {
    id: "website",
    name: "Website",
    format: "{{website}}",
    outcome: "NCTilePros.com",
  },
  {
    id: "service-area",
    name: "Service Area",
    format: "{{serviceArea}}",
    outcome: "Raleigh, Knightdale, Wake Forest, Clayton, and surrounding areas",
  },
  {
    id: "project-type",
    name: "Project Type",
    format: "{{projectType}}",
    outcome: "",
  },
  {
    id: "tile-type",
    name: "Tile Type",
    format: "{{tileType}}",
    outcome: "",
  },
  {
    id: "room-type",
    name: "Room Type",
    format: "{{roomType}}",
    outcome: "",
  },
  {
    id: "city",
    name: "City",
    format: "{{city}}",
    outcome: "",
  },
];

const TEMPLATE_TOKEN_REGEX = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;

function cloneTemplateVariables(variables: TemplateVariableDefinition[]) {
  return variables.map((variable) => ({
    ...variable,
  }));
}

function normalizeTemplateVariableText(value: string | null | undefined) {
  return (value || "").replace(/\r\n/g, "\n").trim();
}

export function deriveTemplateVariableFormatFromName(value: string | null | undefined) {
  const words = normalizeTemplateVariableText(value)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  const [firstWord, ...remainingWords] = words;
  const tokenName = `${firstWord.toLowerCase()}${remainingWords
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join("")}`;

  return tokenName ? `{{${tokenName}}}` : "";
}

export function normalizeTemplateVariableName(value: string | null | undefined) {
  return normalizeTemplateVariableText(value);
}

export function normalizeTemplateVariableFormat(value: string | null | undefined) {
  const normalized = normalizeTemplateVariableText(value);
  const match = normalized.match(/^{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}$/);
  if (!match) {
    return normalized;
  }

  return `{{${match[1]}}}`;
}

export function normalizeTemplateVariableOutcome(value: string | null | undefined) {
  return normalizeTemplateVariableText(value);
}

export function normalizeTemplateVariableDefinition(
  value: Partial<TemplateVariableDefinition> & { id?: string | null },
): TemplateVariableDefinition {
  const derivedFormat = deriveTemplateVariableFormatFromName(value.name);
  const requestedFormat = normalizeTemplateVariableFormat(value.format);
  const normalizedFormat =
    !requestedFormat || requestedFormat === "{{newVariable}}" ? derivedFormat || requestedFormat : requestedFormat;
  const fallbackId = `variable-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: normalizeTemplateVariableText(value.id) || normalizedFormat || value.name?.trim() || globalThis.crypto?.randomUUID?.() || fallbackId,
    name: normalizeTemplateVariableName(value.name),
    format: normalizedFormat,
    outcome: normalizeTemplateVariableOutcome(value.outcome),
  };
}

export function parseStoredTemplateVariables(value: string | null | undefined) {
  if (!value?.trim()) {
    return cloneTemplateVariables(DEFAULT_TEMPLATE_VARIABLES);
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return cloneTemplateVariables(DEFAULT_TEMPLATE_VARIABLES);
    }

    return parsed
      .map((entry) =>
        normalizeTemplateVariableDefinition({
          id: typeof entry?.id === "string" ? entry.id : undefined,
          name: typeof entry?.name === "string" ? entry.name : "",
          format: typeof entry?.format === "string" ? entry.format : "",
          outcome: typeof entry?.outcome === "string" ? entry.outcome : "",
        }),
      )
      .filter((entry) => entry.name && entry.format);
  } catch {
    return cloneTemplateVariables(DEFAULT_TEMPLATE_VARIABLES);
  }
}

export function serializeTemplateVariables(variables: TemplateVariableDefinition[]) {
  return JSON.stringify(
    variables.map((variable) => ({
      id: variable.id,
      name: normalizeTemplateVariableName(variable.name),
      format:
        normalizeTemplateVariableFormat(variable.format) === "{{newVariable}}"
          ? deriveTemplateVariableFormatFromName(variable.name)
          : normalizeTemplateVariableFormat(variable.format),
      outcome: normalizeTemplateVariableOutcome(variable.outcome),
    })),
  );
}

export function buildTemplateVariableValueMap(variables: TemplateVariableDefinition[]): TemplateVariableValueMap {
  return variables.reduce<TemplateVariableValueMap>((accumulator, variable) => {
    const format = normalizeTemplateVariableFormat(variable.format);
    if (!format) {
      return accumulator;
    }

    accumulator[format] = normalizeTemplateVariableOutcome(variable.outcome);
    return accumulator;
  }, {});
}

export function extractTemplateVariableNames(text: string | null | undefined) {
  const normalized = String(text || "");
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = TEMPLATE_TOKEN_REGEX.exec(normalized)) !== null) {
    found.add(`{{${match[1]}}}`);
  }

  return [...found];
}

export function renderTemplateVariables(
  text: string | null | undefined,
  values: TemplateVariableValueMap,
) {
  const unresolved = new Set<string>();
  const renderedText = String(text || "").replace(TEMPLATE_TOKEN_REGEX, (match, rawName: string) => {
    const token = `{{${rawName}}}`;
    const resolvedValue = normalizeTemplateVariableOutcome(values[token]);
    if (!resolvedValue) {
      unresolved.add(token);
      return match;
    }

    return resolvedValue;
  });

  return {
    text: renderedText,
    unresolvedVariableNames: [...unresolved],
  };
}

export function formatTemplateVariableTokens(names: string[]) {
  return names;
}
