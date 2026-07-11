import { formatRrn7, rrn7Placeholder } from "@/lib/rrn7Input";

type Field = {
  id: string;
  label: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
};

export function renderFormField(
  f: Field,
  value: string,
  onChange: (val: string) => void,
  disabled: boolean,
) {
  const opts = (f.options ?? []).filter(Boolean);

  switch (f.fieldType) {
    case "rrn7":
      return (
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="input w-full font-mono tracking-wide"
          value={formatRrn7(value)}
          onChange={(e) => onChange(formatRrn7(e.target.value))}
          placeholder={rrn7Placeholder()}
          maxLength={8}
          pattern="\d{6}-\d"
          required={f.required}
          disabled={disabled}
        />
      );
    case "textarea":
      return (
        <textarea
          className="input w-full min-h-[80px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        />
      );
    case "date":
      return (
        <div className="input-date-shell">
          <input
            type="date"
            className="input input-date-compact"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={f.required}
            disabled={disabled}
          />
        </div>
      );
    case "select":
      return (
        <select
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        >
          <option value="">선택하세요</option>
          {opts.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="space-y-1.5 mt-1">
          {opts.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`field-${f.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                required={f.required}
                disabled={disabled}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      );
    case "checkbox": {
      const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
      return (
        <div className="space-y-1.5 mt-1">
          {opts.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={opt}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt];
                    onChange(next.join(","));
                  }}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-gray-700">{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <input
          type="text"
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        />
      );
  }
}

export function validateFormField(f: Field, value: string): string | null {
  const val = String(value ?? "").trim();
  if (f.required && !val) {
    return `필수 항목을 입력해 주세요: ${f.label}`;
  }
  if (f.fieldType === "rrn7" && val && !/^\d{6}-\d$/.test(val)) {
    return "주민번호는 000000-0 형식(6자리-성별1자리)으로 입력해 주세요.";
  }
  return null;
}
