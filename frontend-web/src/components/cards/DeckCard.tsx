import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Pencil, Swords } from "lucide-react";
import { FormatBadge } from "../badges/FormatBadge";
import { StatusBadge } from "../badges/StatusBadge";
import type { Deck } from "../../types/api";
import { formatPercent, formatRecord } from "../../utils/format";
import { nationColor } from "../../utils/nations";

type DeckCardProps = { deck: Deck; onEdit?: (deck: Deck) => void };

export function DeckCard({ deck, onEdit }: DeckCardProps) {
  function prepareBuilder() {
    try {
      window.localStorage.setItem("cardfight.deck-builder.selected-deck", JSON.stringify(String(deck.id)));
      window.localStorage.removeItem("cardfight.deck-builder.selected-version");
    } catch { /* Navigation remains available without browser storage. */ }
  }
  return (
    <article data-anime="motion-card" className="deck-showcase" style={{ "--nation-color": nationColor(deck.nation) } as CSSProperties}>
      <div className="deck-cover">
        <span className="deck-cover-format"><FormatBadge type={deck.type} /></span>
        <span className="deck-cover-status"><StatusBadge active={deck.active} /></span>
        {deck.nation_icon ? <img src={`/nations/${deck.nation_icon}`} alt="" loading="lazy" /> : <Swords size={60} strokeWidth={1} />}
      </div>
      <div className="deck-info">
        <p className="deck-nation">{deck.nation ?? "Unassigned nation"}</p>
        <h3>{deck.name}</h3>
        <dl className="deck-record">
          <div><dt>Record</dt><dd>{formatRecord(deck.wins, deck.losses)}</dd></div>
          <div><dt>Win rate</dt><dd>{formatPercent(deck.win_pct)}</dd></div>
          <div><dt>Decided</dt><dd>{deck.decided_games}</dd></div>
        </dl>
        <div className="deck-actions">
          <Link to="/deck-builder" onClick={prepareBuilder} aria-label={`Open ${deck.name} in deck builder`}>Open builder <ArrowUpRight size={14} /></Link>
          {onEdit && <button type="button" onClick={() => onEdit(deck)} aria-label={`Edit ${deck.name}`}><Pencil size={13} /> Edit deck</button>}
        </div>
      </div>
    </article>
  );
}
