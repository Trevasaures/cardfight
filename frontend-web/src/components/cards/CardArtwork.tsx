import { useState, type CSSProperties } from "react";
import { Layers3 } from "lucide-react";
import type { Card, CardPrinting } from "../../types/api";
import { nationColor } from "../../utils/nations";
import { apiAssetUrl } from "../../api/client";
import { ArtworkDialog } from "./ArtworkDialog";

export function CardArtwork({
  card,
  printing,
  detail = false,
}: {
  card: Card;
  printing?: CardPrinting | null;
  detail?: boolean;
}) {
  const artwork = [printing, card.primary_printing, ...card.printings].find(
    (candidate) => candidate?.image_url,
  );
  const source = detail
    ? artwork?.image_url
    : artwork?.thumbnail_url || artwork?.image_url;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const image =
    source && source !== failedSource ? (
      <img
        src={apiAssetUrl(source)}
        alt={`${card.name} card artwork`}
        loading="lazy"
        decoding="async"
        onError={() => setFailedSource(source)}
      />
    ) : null;
  return (
    <div
      className="catalog-artwork"
      style={{ "--nation-color": nationColor(card.nation) } as CSSProperties}
    >
      {image ? (
        detail ? (
          <button
            type="button"
            className="card-artwork-zoom"
            aria-label={`Enlarge ${card.name} artwork`}
            onClick={() => setExpanded(true)}
          >
            {image}
          </button>
        ) : (
          image
        )
      ) : (
        <>
          <Layers3 size={24} strokeWidth={1} aria-hidden="true" />
          <span>GRADE {card.grade ?? "?"}</span>
        </>
      )}
      {expanded && source && (
        <ArtworkDialog
          source={source}
          name={card.name}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
