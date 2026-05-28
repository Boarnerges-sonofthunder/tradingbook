import type { ReactNode } from "react";

interface SettingsSectionProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

export default function SettingsSection({
  id,
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section id={id} className="settings-section">
      <div className="settings-section__header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}
