import { ShieldCheck } from "lucide-react";
import "./persona.css";

/** Generated tickets are table pieces, so they do not need catalog artwork. */
export function PersonaTicketArtwork() {
  return (
    <span className="pt-persona-art" aria-hidden="true">
      <span className="pt-persona-art-label">PERSONA</span>
      <ShieldCheck size={32} strokeWidth={1.2} />
      <strong>SHIELD</strong>
      <small>TICKET</small>
    </span>
  );
}
