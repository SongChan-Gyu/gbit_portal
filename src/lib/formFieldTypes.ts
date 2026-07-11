export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
  "rrn7",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export function isFormFieldType(value: string): value is FormFieldType {
  return (FORM_FIELD_TYPES as readonly string[]).includes(value);
}

export function formFieldUsesOptions(fieldType: string): boolean {
  return fieldType === "select" || fieldType === "radio" || fieldType === "checkbox";
}
