const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lt: "<",
  gt: ">",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  bull: "•",
};

function removeCopiedFormatting(value: string): string {
  let previous: string;

  // Removing an inner tag can expose another formatting tag. Repeat until stable
  // so saved text does not change again when it is opened or rendered later.
  do {
    previous = value;
    value = value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?(?:p|div|li|ul|ol)\b[^<>]*>/gi, "\n")
      .replace(/<\/?(?:span|strong|em|b|i|u)\b[^<>]*>/gi, "");
  } while (value !== previous);

  return value;
}

/**
 * Normalize copied marketplace text for plain-text display, not HTML insertion.
 * Literal comparisons and unknown markup are preserved; React escapes the result.
 */
export function normalizeCardText(value: string | null | undefined): string {
  if (!value) return "";

  return (
    removeCopiedFormatting(
      value
        // Decode common pasted entities without inserting HTML into the document.
        .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
          if (!name.startsWith("#"))
            return ENTITIES[name.toLowerCase()] ?? entity;
          const code =
            name[1].toLowerCase() === "x"
              ? Number.parseInt(name.slice(2), 16)
              : Number.parseInt(name.slice(1), 10);
          return code > 0 &&
            code <= 0x10ffff &&
            !(code >= 0xd800 && code <= 0xdfff)
            ? String.fromCodePoint(code)
            : entity;
        }),
    )
      // Marketplace exports may contain literal escapes and doubled CSV quotes.
      .replace(/\\r\\n|\\[rn]/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\"/g, '"')
      .replace(/"{2,}/g, '"')
      // Preserve meaningful line breaks and card-rule punctuation while tidying spacing.
      .replace(/\r\n?|[\u2028\u2029]/g, "\n")
      .replace(/[\u200b\ufeff]/g, "")
      .replace(/[^\S\n]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
