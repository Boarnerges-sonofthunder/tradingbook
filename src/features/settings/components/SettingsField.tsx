import type { ReactNode } from "react";

interface SettingsFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export default function SettingsField({
  label,
  hint,
  children,
}: SettingsFieldProps) {
  return (
    <label className="settings-field">
      <span className="settings-field__label">{label}</span>
      {hint && <span className="settings-field__hint">{hint}</span>}
      {children}
    </label>
  );
}
