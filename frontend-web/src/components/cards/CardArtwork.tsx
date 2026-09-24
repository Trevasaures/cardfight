import { useState, type CSSProperties } from "react";
import { Layers3 } from "lucide-react";
import type { Card } from "../../types/api";
import { nationColor } from "../../utils/nations";

export function CardArtwork({ card }: { card: Card }) {
  const source = card.primary_printing?.image_url || card.printings.find((printing) => printing.image_url)?.image_url;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <div className="catalog-artwork" style={{ "--nation-color": nationColor(card.nation) } as CSSProperties}>
    {source && failedSource !== source
      ? <img src={source} alt={`${card.name} card artwork`} loading="lazy" onError={() => setFailedSource(source)} />
      : <><Layers3 size={24} strokeWidth={1} aria-hidden="true" /><span>GRADE {card.grade ?? "?"}</span></>}
  </div>;
}
