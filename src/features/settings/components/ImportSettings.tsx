export default function ImportSettings() {
  return (
    <div className="settings-list">
      <div className="settings-list-item">
        <span>Validation CSV avant import</span>
        <span className="badge badge-positive">active</span>
      </div>
      <div className="settings-list-item">
        <span>Detection broker automatique</span>
        <span className="badge badge-positive">active</span>
      </div>
      <div className="settings-list-item">
        <span>Gestion des doublons</span>
        <span className="badge badge-neutral">locale</span>
      </div>
      <p className="settings-note">
        Les profils d'import personnalisables seront ajoutes plus tard.
      </p>
    </div>
  );
}
