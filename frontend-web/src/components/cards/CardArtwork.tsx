import { useState, type CSSProperties } from "react";
import { Layers3, Shield } from "lucide-react";
import type { Card, CardPrinting } from "../../types/api";
import { nationColor } from "../../utils/nations";
import { cardGradeLabel, isCrestCard } from "../../utils/cards";
import { apiAssetUrl } from "../../api/client";
import { ArtworkDialog } from "./ArtworkDialog";
import { resolveCardArtwork } from "./cardArtworkState";

export function CardArtwork({
  card,
  printing,
  detail = false,
}: {
  card: Card;
  printing?: CardPrinting | null;
  detail?: boolean;
}) {
  const artwork = resolveCardArtwork(card, printing);
  const source = detail
    ? artwork?.image_url
    : artwork?.thumbnail_url || artwork?.image_url;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const unavailableLabel = source
    ? "Artwork unavailable"
    : printing
      ? "No artwork for this printing"
      : "No artwork saved";
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
      className={`catalog-artwork${isCrestCard(card) ? " crest-artwork" : ""}`}
      style={{ "--nation-color": nationColor(card.nation) } as CSSProperties}
      role={image ? undefined : "img"}
      aria-label={image ? undefined : `${card.name}: ${unavailableLabel}`}
      title={image ? undefined : unavailableLabel}
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
          {isCrestCard(card) ? (
            <Shield size={24} strokeWidth={1} aria-hidden="true" />
          ) : (
            <Layers3 size={24} strokeWidth={1} aria-hidden="true" />
          )}
          <span>{cardGradeLabel(card)}</span>
        </>
      )}
      {expanded && image && source && (
        <ArtworkDialog
          source={source}
          name={card.name}
          landscape={isCrestCard(card)}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
