export default function LogsSettings() {
  return (
    <div className="settings-list">
      <div className="settings-list-item">
        <span>Fichiers journaliers</span>
        <span className="badge badge-positive">actifs</span>
      </div>
      <div className="settings-list-item">
        <span>Rotation</span>
        <span className="badge badge-neutral">30 jours</span>
      </div>
      <div className="settings-list-item">
        <span>Consultation</span>
        <span className="badge badge-neutral">page Logs</span>
      </div>
      <p className="settings-note">
        Les logs techniques sont locaux et servent au diagnostic uniquement.
      </p>
    </div>
  );
}
