import { useEffect, useState } from "react";

import { CardImageImportAssistant } from "../deck-builder/CardImageImportAssistant";
import { ManualCardForm } from "../deck-builder/ManualCardForm";
import type { ManualCardFormState } from "../deck-builder/manualCardFormState";
import type {
  CardFormOptions,
  CardImageAnalysisResult,
} from "../../types/api";

type CardCreationToolsProps = {
  value: ManualCardFormState;
  analysisResult: CardImageAnalysisResult | null;
  analyzingImage: boolean;
  saving: boolean;
  canSubmit: boolean;
  options: CardFormOptions;
  onChange: (value: ManualCardFormState) => void;
  onSubmit: () => void;
  onAnalyzeImage: (file: File) => void;
  onApplyAnalysis: () => void;
};

export function CardCreationTools({
  value,
  analysisResult,
  analyzingImage,
  saving,
  canSubmit,
  options,
  onChange,
  onSubmit,
  onAnalyzeImage,
  onApplyAnalysis,
}: CardCreationToolsProps) {
  const [manualEntryOpen, setManualEntryOpen] = useState(
    Boolean(analysisResult),
  );

  useEffect(() => {
    if (analysisResult) {
      setManualEntryOpen(true);
    }
  }, [analysisResult]);

  return (
    <div>
      <CardImageImportAssistant
        analysisResult={analysisResult}
        analyzing={analyzingImage}
        onAnalyzeImage={onAnalyzeImage}
        onApplyAnalysis={onApplyAnalysis}
      />

      <details
        open={manualEntryOpen}
        onToggle={(event) => setManualEntryOpen(event.currentTarget.open)}
        className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4"
      >
        <summary className="cursor-pointer select-none">
          <span className="text-sm font-black text-slate-100">
            Review or enter card details
          </span>
          <span className="ml-2 text-xs font-semibold text-slate-500">
            Manual entry
          </span>
        </summary>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          Fill these fields yourself, or review the suggestions produced by the
          image reader before adding the card to the shared catalog.
        </p>

        <ManualCardForm
          value={value}
          mode="create"
          onChange={onChange}
          onSubmit={onSubmit}
          onCancelEdit={() => undefined}
          disabled={saving}
          canSubmit={canSubmit}
          options={options}
        />
      </details>
    </div>
  );
}
