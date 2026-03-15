export interface PromptFileRow {
  id: number;
  code: string | null;
}

export interface PromptFileRecord {
  id: number;
  code: string | null;
  fileBase: string;
  fileName: string;
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export function sanitizePromptFileBase(code: string, fallbackBaseName: string): string {
  let baseName = code
    .replace(INVALID_FILENAME_CHARS, "_")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!baseName) {
    baseName = fallbackBaseName;
  }

  if (RESERVED_WINDOWS_NAMES.has(baseName.toLowerCase())) {
    baseName = `${baseName}_prompt`;
  }

  return baseName;
}

export function buildPromptFileRecords(rows: PromptFileRow[]): PromptFileRecord[] {
  const usedFileNames = new Set<string>();
  const records: PromptFileRecord[] = [];

  for (const row of rows) {
    const rawCode = row.code?.trim() ?? "";
    const fallbackCode = `prompt-${row.id}`;
    const safeBase = sanitizePromptFileBase(rawCode, fallbackCode);
    let fileBase = safeBase;
    let suffix = 2;

    while (usedFileNames.has(fileBase.toLowerCase())) {
      fileBase = `${safeBase}-${suffix}`;
      suffix += 1;
    }

    usedFileNames.add(fileBase.toLowerCase());
    records.push({
      id: row.id,
      code: row.code,
      fileBase,
      fileName: `${fileBase}.md`,
    });
  }

  return records;
}
