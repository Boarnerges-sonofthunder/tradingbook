// ============================================================
// CsvInvalidRowsTable — Tableau des lignes invalides
// ============================================================
// Phase 5 Étape 6 — Prévisualisation avant import.
//
// Affiche les lignes CSV qui NE PEUVENT PAS être importées,
// avec la liste de leurs erreurs bloquantes.
//
// Ces lignes sont exclues de l'import définitif.
// L'utilisateur peut :
//   - Corriger son fichier CSV source
//   - Revenir au mapping pour modifier les associations
//
// Props :
//   rows — CsvValidatedRow[] avec status === "invalid" uniquement
//          (le filtrage est effectué par le composant parent)
//
// Composant purement affichant — pas d'effets de bord.
// Aucun appel SQLite ni I/O.
// ============================================================

import { XCircle } from "lucide-react";
import type { CsvValidatedRow } from "../../../types/csvImport";

// ─── Props ─────────────────────────────────────────────────

interface Props {
  /** Lignes invalides — status === "invalid". */
  rows: CsvValidatedRow[];
}

// ─── Composant ─────────────────────────────────────────────

export default function CsvInvalidRowsTable({ rows }: Props) {
  // Le composant parent garantit que rows.length > 0 avant de le rendre
  if (rows.length === 0) return null;

  return (
    <div className="csv-invalid-table">
      <div className="csv-invalid-table__wrapper">
        <table className="csv-invalid-table__table">
          <thead>
            <tr>
              {/* Numéro de ligne dans le fichier CSV (header = ligne 1) */}
              <th className="csv-invalid-table__th csv-invalid-table__th--num">
                Ligne
              </th>
              {/* Symbole parsé (peut être null si l'erreur porte sur ce champ) */}
              <th className="csv-invalid-table__th">Symbole</th>
              {/* Sens (buy/sell) parsé — peut être null */}
              <th className="csv-invalid-table__th">Sens</th>
              {/* Liste complète des erreurs bloquantes */}
              <th className="csv-invalid-table__th">Erreurs bloquantes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index} className="csv-invalid-table__row">
                {/*
                  Numéro de ligne CSV.
                  index est 0-based, la ligne 0 correspond à la ligne 2 du fichier
                  (la ligne 1 étant le header CSV).
                */}
                <td className="csv-invalid-table__td csv-invalid-table__td--num">
                  <span className="csv-invalid-table__line-num">
                    {row.index + 2}
                  </span>
                </td>

                {/* Symbole parsé depuis la colonne mappée */}
                <td className="csv-invalid-table__td">
                  {row.parsed.symbol ? (
                    <span className="csv-invalid-table__symbol">
                      {row.parsed.symbol}
                    </span>
                  ) : (
                    // Le symbole peut être absent si c'est lui-même qui est invalide
                    <span className="csv-invalid-table__missing">—</span>
                  )}
                </td>

                {/* Sens parsé depuis la colonne mappée */}
                <td className="csv-invalid-table__td">
                  {row.parsed.side ? (
                    <span
                      className={`csv-invalid-table__side csv-invalid-table__side--${row.parsed.side}`}
                    >
                      {row.parsed.side.toUpperCase()}
                    </span>
                  ) : (
                    <span className="csv-invalid-table__missing">—</span>
                  )}
                </td>

                {/* Liste des erreurs bloquantes de cette ligne */}
                <td className="csv-invalid-table__td csv-invalid-table__td--errors">
                  <ul className="csv-invalid-table__errors">
                    {row.errors.map((error, i) => (
                      <li key={i} className="csv-invalid-table__error">
                        <XCircle size={11} aria-hidden />
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
