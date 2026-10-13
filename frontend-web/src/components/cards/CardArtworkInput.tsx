import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { importCardArtwork, normalizeCrestArtwork } from "../../api/cards";
import { apiAssetUrl } from "../../api/client";
import { isCrestCard } from "../../utils/cards";
import type { CardArtworkValue } from "./cardArtworkState";
import "./card-artwork.css";

type Props = {
  value: CardArtworkValue | null;
  cardType?: string | null;
  disabled?: boolean;
  onChange: (value: CardArtworkValue | null) => void;
  onBusyChange: (busy: boolean) => void;
};

/** Import prepares a preview; only the surrounding card form attaches it on Save. */
export function CardArtworkInput({
  value,
  cardType,
  disabled,
  onChange,
  onBusyChange,
}: Props) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const callbacks = useRef({ onChange, onBusyChange });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const crest = isCrestCard(cardType);

  useEffect(() => {
    callbacks.current = { onChange, onBusyChange };
  }, [onChange, onBusyChange]);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function prepare(source: File | string | { imageId: string }) {
    if (source instanceof File && source.size > 8 * 1024 * 1024) {
      setError("Image must be 8 MB or smaller.");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    callbacks.current.onBusyChange(true);
    setError("");
    try {
      const artwork =
        typeof source === "object" && "imageId" in source
          ? await normalizeCrestArtwork(source.imageId, cardType!, controller.signal)
          : await importCardArtwork(source, controller.signal, cardType);
      if (!controller.signal.aborted) {
        // Use the latest form callback so typing while importing is never overwritten.
        callbacks.current.onChange(artwork);
        setUrl("");
      }
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Could not import artwork.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        callbacks.current.onBusyChange(false);
      }
    }
  }

  return (
    <div
      className={`card-artwork-editor${crest ? " is-crest" : ""}`}
      aria-label="Card artwork"
      aria-busy={busy}
    >
      <div className="card-artwork-preview">
        {value ? (
          <img src={apiAssetUrl(value.thumbnail_url)} alt="Artwork preview" />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
      </div>
      <div className="card-artwork-controls">
        <label htmlFor={inputId}>
          Artwork <span>(optional)</span>
        </label>
        <div className="card-artwork-url">
          <input
            id={inputId}
            type="url"
            value={url}
            placeholder="Paste image URL…"
            disabled={disabled || busy}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && url.trim()) {
                event.preventDefault();
                void prepare(url.trim());
              }
            }}
          />
          <button
            type="button"
            className="workspace-button"
            disabled={disabled || busy || !url.trim()}
            onClick={() => void prepare(url.trim())}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}{" "}
            Import
          </button>
        </div>
        <div className="card-artwork-buttons">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void prepare(file);
            }}
          />
          <button
            type="button"
            className="workspace-button"
            disabled={disabled || busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} /> Upload image
          </button>
          {value && (
            <button
              type="button"
              className="workspace-button"
              disabled={disabled || busy}
              onClick={() => {
                onChange(null);
                setError("");
              }}
            >
              <X size={14} /> Remove
            </button>
          )}
          {crest && value?.id && (
            <button
              type="button"
              className="workspace-button"
              disabled={disabled || busy}
              title="Prepare landscape artwork; Save applies it to this printing"
              onClick={() => void prepare({ imageId: value.id! })}
            >
              <RotateCcw size={14} /> Normalize crest
            </button>
          )}
          {busy && <span role="status">Preparing artwork…</span>}
        </div>
        {error && (
          <p className="card-artwork-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
