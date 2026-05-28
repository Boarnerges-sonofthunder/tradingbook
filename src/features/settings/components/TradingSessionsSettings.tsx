const DEFAULT_SESSIONS = [
  "Asie : 20:00 - 03:00",
  "Londres : 03:00 - 11:30",
  "New York : 08:30 - 16:00",
];

export default function TradingSessionsSettings() {
  return (
    <div className="settings-list">
      {DEFAULT_SESSIONS.map((session) => (
        <div key={session} className="settings-list-item">
          <span>{session}</span>
          <span className="badge badge-neutral">préparé</span>
        </div>
      ))}
      <p className="settings-note">
        Les sessions personnalisables seront branchées sur les analyses dans une
        étape suivante.
      </p>
    </div>
  );
}
