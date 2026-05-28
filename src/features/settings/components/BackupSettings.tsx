export default function BackupSettings() {
  return (
    <div className="settings-list">
      <div className="settings-list-item">
        <span>Backups automatiques</span>
        <span className="badge badge-positive">actifs</span>
      </div>
      <div className="settings-list-item">
        <span>Format principal</span>
        <span className="badge badge-neutral">ZIP</span>
      </div>
      <div className="settings-list-item">
        <span>Retention auto</span>
        <span className="badge badge-neutral">10 derniers</span>
      </div>
      <p className="settings-note">
        Les backups restent locaux et les anciens backups manuels ne sont pas
        supprimes automatiquement.
      </p>
    </div>
  );
}
