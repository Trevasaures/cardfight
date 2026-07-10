import { useId } from "react";
import { HelpCircle } from "lucide-react";

type HelpTooltipProps = {
  text: string;
};

export function HelpTooltip({ text }: HelpTooltipProps) {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <HelpCircle
        className="h-4 w-4 cursor-help text-slate-500 transition hover:text-cyan-200"
        aria-hidden="true"
      />

      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-64 -translate-x-1/2 rounded-2xl 
        border border-white/10 bg-slate-950 px-4 py-3 text-left text-xs font-medium normal-case leading-5 tracking-normal text-slate-300 shadow-2xl 
        shadow-black/40 group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  );
}

type FieldLabelProps = {
  htmlFor: string;
  label: string;
  help: string;
  required?: boolean;
};

export function FieldLabel({
  htmlFor,
  label,
  help,
  required = false,
}: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
    >
      <span>
        {label}
        {required ? <span className="ml-1 text-cyan-200">*</span> : null}
      </span>

      <HelpTooltip text={help} />
    </label>
  );
}

type FormTextInputProps = {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  type?: string;
  min?: number;
  readOnly?: boolean;
};

export function FormTextInput({
  label,
  help,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
  min,
  readOnly = false,
}: FormTextInputProps) {
  const inputId = useId();

  return (
    <div>
      <FieldLabel
        htmlFor={inputId}
        label={label}
        help={help}
        required={required}
      />

      <input
        id={inputId}
        type={type}
        min={min}
        value={value}
        required={required}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        title={help}
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/50 read-only:cursor-default read-only:text-slate-400"
      />
    </div>
  );
}

type FormSelectOption = {
  value: string;
  label: string;
};

type FormSelectProps = {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder: string;
  required?: boolean;
};

export function FormSelect({
  label,
  help,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}: FormSelectProps) {
  const selectId = useId();

  return (
    <div>
      <FieldLabel
        htmlFor={selectId}
        label={label}
        help={help}
        required={required}
      />

      <select
        id={selectId}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        title={help}
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
