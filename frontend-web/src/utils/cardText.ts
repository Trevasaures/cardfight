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

/** Clean copied marketplace text without interpreting card rules or rendering HTML. */
export function normalizeCardText(value: string | null | undefined): string {
  if (!value) return "";

  return (
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
      })
      // Keep paragraph boundaries while removing known presentation tags.
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?(?:p|div|li|ul|ol)\b[^>]*>/gi, "\n")
      // Remove all tag delimiters so unhandled tags (for example <iframe>) cannot survive.
      .replace(/[<>]/g, "")
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
