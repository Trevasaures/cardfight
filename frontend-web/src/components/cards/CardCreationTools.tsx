import { useEffect, useState } from "react";

import { CardImageImportAssistant } from "../deck-builder/CardImageImportAssistant";
import { ManualCardForm } from "../deck-builder/ManualCardForm";
import { CardSetManager } from "./CardSetManager";
import type { ManualCardFormState } from "../deck-builder/manualCardFormState";
import type {
  CardFormOptions,
  CardImageAnalysisResult,
  CardSetOption,
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
  onSetSaved: (cardSet: CardSetOption) => void;
  onSetUpdated: (previousCode: string, cardSet: CardSetOption) => void;
  onSetDeleted: (setCode: string) => void;
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
  onSetSaved,
  onSetUpdated,
  onSetDeleted,
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

      <CardSetManager
        refreshToken={options.sets
          .map((cardSet) => `${cardSet.code}:${cardSet.name}`)
          .join("|")}
        onSetUpdated={onSetUpdated}
        onSetDeleted={onSetDeleted}
      />

      <details
        open={manualEntryOpen}
        onToggle={(event) => setManualEntryOpen(event.currentTarget.open)}
        className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3"
      >
        <summary className="cursor-pointer select-none">
          <span className="text-sm font-black text-slate-100">Card details</span>

        </summary>

        <ManualCardForm
          value={value}
          mode="create"
          onChange={onChange}
          onSubmit={onSubmit}
          onCancelEdit={() => undefined}
          disabled={saving}
          canSubmit={canSubmit}
          options={options}
          onSetSaved={onSetSaved}
        />
      </details>
    </div>
  );
}
