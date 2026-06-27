import { useEffect, useId, useState } from "react";
import { AlertTriangle, Check, ImageUp, Loader2, Sparkles } from "lucide-react";

import type { CardImageAnalysisResult } from "../../types/api";

type CardImageImportAssistantProps = {
  analysisResult: CardImageAnalysisResult | null;
  analyzing: boolean;
  onAnalyzeImage: (file: File) => void;
  onApplyAnalysis: () => void;
};

function confidenceLabel(value: number) {
  if (value >= 75) return "High";
  if (value >= 45) return "Medium";
  if (value > 0) return "Low";
  return "Unknown";
}

export function CardImageImportAssistant({
  analysisResult,
  analyzing,
  onAnalyzeImage,
  onApplyAnalysis,
}: CardImageImportAssistantProps) {
  const inputId = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function setImageFile(file: File | null) {
    setLocalError(null);

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLocalError("Choose an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setLocalError("Image must be 8 MB or smaller.");
      return;
    }

    setSelectedFile(file);

    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return URL.createObjectURL(file);
    });
  }

  function handleAnalyze() {
    if (!selectedFile) {
      setLocalError("Choose or drop a card image first.");
      return;
    }

    onAnalyzeImage(selectedFile);
  }

  return (
    <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-100">
            Card image import assistant
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Drop a card image, analyze it, then apply the suggested fields to the
            form below.
          </p>
        </div>

        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
          MVP
        </span>
      </div>

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          setImageFile(event.dataTransfer.files.item(0));
        }}
        className={[
          "mt-4 rounded-3xl border border-dashed p-4 transition",
          dragActive
            ? "border-cyan-300/50 bg-cyan-300/10"
            : "border-white/15 bg-white/[0.025]",
        ].join(" ")}
      >
        <div className="grid gap-4 md:grid-cols-[10rem_1fr] md:items-center">
          <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected card preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageUp className="h-10 w-10 text-slate-600" />
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-slate-200">
              {selectedFile ? selectedFile.name : "Drop image here"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Use a clear PNG, JPG, or WEBP card image if possible. Cropped,
              low-resolution, or tilted images may be harder to analyze.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <label
                htmlFor={inputId}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/[0.09]"
              >
                <ImageUp className="h-4 w-4" />
                Choose image
              </label>

              <input
                id={inputId}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) =>
                  setImageFile(event.target.files?.item(0) ?? null)
                }
              />

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!selectedFile || analyzing}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Analyze image
              </button>

              <button
                type="button"
                onClick={onApplyAnalysis}
                disabled={!analysisResult}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Apply suggestion
              </button>
            </div>
          </div>
        </div>
      </div>

      {localError ? (
        <p className="mt-3 text-sm font-semibold text-rose-200">{localError}</p>
      ) : null}

      {analysisResult ? (
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-100">
              Suggested fields
            </p>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">
              Provider: {analysisResult.provider}
            </span>
          </div>

          {analysisResult.warnings.length ? (
            <div className="mt-3 space-y-2">
              {analysisResult.warnings.map((warning) => (
                <div
                  key={warning}
                  className="flex gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(analysisResult.fields).map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-white/10 bg-black/20 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    {key.replace("_", " ")}
                  </p>
                  <span className="text-xs font-bold text-slate-500">
                    {confidenceLabel(
                      analysisResult.confidence[
                        key as keyof CardImageAnalysisResult["confidence"]
                      ],
                    )}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-slate-100">
                  {value || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}