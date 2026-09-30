import type { CardPrinting } from "../../types/api";

export type CardArtworkValue = {
  id: string | null;
  image_url: string;
  thumbnail_url: string;
};

export function artworkFromPrinting(
  printing?: CardPrinting | null,
): CardArtworkValue | null {
  if (!printing?.image_url) return null;
  return {
    id: printing.image_id ?? null,
    image_url: printing.image_url,
    thumbnail_url: printing.thumbnail_url || printing.image_url,
  };
}

export function artworkPayload(artwork: CardArtworkValue | null) {
  return {
    image_id: artwork?.id ?? null,
    // Keep legacy URLs when unchanged; a stored image or Remove clears that fallback.
    image_url: artwork?.id ? null : (artwork?.image_url ?? null),
  };
}
