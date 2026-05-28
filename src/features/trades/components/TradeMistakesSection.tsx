// ============================================================
// TradeMistakesSection — Erreurs associées à un trade
// ============================================================
// Fonctionnalités :
//   - Affiche les erreurs du trade sous forme de chips
//   - Associe une erreur existante via un menu de recherche
//   - Crée une nouvelle erreur personnalisée à la volée
//   - Permet d'ajouter une note contextuelle à chaque erreur
//     (ex : "J'ai déplacé le SL car le trade était proche du TP")
//   - Retire une erreur du trade via le bouton ×
//   - Cliquer sur une chip ouvre/ferme l'édition de la note
//
// Architecture de données (deux tables distinctes) :
//   - `mistakes`       : catalogue global des erreurs (réutilisables)
//   - `trade_mistakes` : liaison (trade_id, mistake_id) + notes — PK composite
//
// Règles métier :
//   - PK composite (trade_id, mistake_id) → une erreur ne peut être
//     ajoutée qu'une seule fois par trade (INSERT OR REPLACE)
//   - Les notes sont optionnelles et propres à chaque liaison
//   - Supprimer un trade → supprime ses trade_mistakes (ON DELETE CASCADE)
//   - Supprimer un trade ne supprime PAS les erreurs du catalogue
//   - Le nom est trimmé ; la casse est ignorée pour la déduplication
//
// Services utilisés :
//   - mistakesService.getMistakes()           → catalogue global
//   - mistakesService.getMistakesForTrade()   → erreurs du trade courant
//   - mistakesService.createMistake()         → crée + valide via Zod
//   - mistakesService.addMistakeToTrade()     → upsert dans trade_mistakes
//   - mistakesService.removeMistakeFromTrade()→ supprime de trade_mistakes
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { X, AlertTriangle } from "lucide-react";
import {
  getMistakes,
  getMistakesForTrade,
  createMistake,
  addMistakeToTrade,
  removeMistakeFromTrade,
} from "../../../services/mistakes/mistakesService";
import type { Mistake, TradeMistake } from "../../../types";
import { useNotification } from "../../../hooks";

// ─── Props ────────────────────────────────────────────────

interface TradeMistakesSectionProps {
  /** Identifiant du trade parent. */
  tradeId: number;
}

// ─── Composant principal ──────────────────────────────────

export default function TradeMistakesSection({
  tradeId,
}: TradeMistakesSectionProps) {
  const notify = useNotification();

  // ── État ─────────────────────────────────────────────

  /** Erreurs actuellement associées à ce trade. */
  const [tradeMistakes, setTradeMistakes] = useState<TradeMistake[]>([]);
  /** Catalogue global de toutes les erreurs disponibles. */
  const [allMistakes, setAllMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);

  /** Saisie dans le champ de recherche / création. */
  const [inputValue, setInputValue] = useState("");
  /** Afficher le menu déroulant de suggestions. */
  const [showDropdown, setShowDropdown] = useState(false);

  /** Note en cours de saisie dans le formulaire d'ajout. */
  const [pendingNote, setPendingNote] = useState("");

  /**
   * mistakeId dont on est en train d'éditer la note inline.
   * null = aucune chip en mode édition.
   */
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  /** Valeur temporaire de la note en cours d'édition. */
  const [editingNoteValue, setEditingNoteValue] = useState("");

  /** Opération d'ajout en cours. */
  const [adding, setAdding] = useState(false);
  /** mistakeId en cours de suppression. */
  const [removingId, setRemovingId] = useState<number | null>(null);
  /** mistakeId dont on est en train de sauvegarder la note. */
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Chargement initial ────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([getMistakesForTrade(tradeId), getMistakes()])
      .then(([tm, all]) => {
        if (cancelled) return;
        setTradeMistakes(tm);
        setAllMistakes(all);
      })
      .catch(() => {
        if (!cancelled) notify.error("Impossible de charger les erreurs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  // ── Fermeture du dropdown au clic extérieur ───────────

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // ── Calculs dérivés ───────────────────────────────────

  const trimmed = inputValue.trim();
  const trimmedLower = trimmed.toLowerCase();

  /** IDs des erreurs déjà associées à ce trade. */
  const existingIds = new Set(tradeMistakes.map((tm) => tm.mistakeId));

  /** Suggestions filtrées sur la saisie. */
  const suggestions = allMistakes.filter(
    (m) => trimmedLower === "" || m.name.toLowerCase().includes(trimmedLower),
  );

  /** Correspondance exacte dans le catalogue. */
  const exactMatch = allMistakes.find(
    (m) => m.name.toLowerCase() === trimmedLower,
  );

  /** Proposer la création si aucune correspondance exacte et saisie non vide. */
  const showCreateOption = trimmed.length > 0 && !exactMatch;

  // ── Associer une erreur existante ─────────────────────

  const handleSelect = useCallback(
    async (mistake: Mistake) => {
      setAdding(true);
      try {
        await addMistakeToTrade({
          tradeId,
          mistakeId: mistake.id,
          notes: pendingNote.trim() || null,
        });

        const newEntry: TradeMistake = {
          tradeId,
          mistakeId: mistake.id,
          notes: pendingNote.trim() || null,
          createdAt: new Date().toISOString(),
          mistakeName: mistake.name,
        };

        // INSERT OR REPLACE → remplacer si déjà présente
        setTradeMistakes((prev) => [
          ...prev.filter((tm) => tm.mistakeId !== mistake.id),
          newEntry,
        ]);

        const action = existingIds.has(mistake.id) ? "mise à jour" : "ajoutée";
        notify.success(`"${mistake.name}" ${action}`);
        setInputValue("");
        setPendingNote("");
        setShowDropdown(false);
      } catch {
        notify.error(`Impossible d'associer "${mistake.name}"`);
      } finally {
        setAdding(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tradeId, pendingNote, existingIds],
  );

  // ── Créer puis associer une nouvelle erreur ───────────

  async function handleCreate() {
    if (!trimmed) return;

    // Réutiliser si correspondance insensible à la casse
    if (exactMatch) {
      await handleSelect(exactMatch);
      return;
    }

    setAdding(true);
    try {
      const newMistake = await createMistake({ name: trimmed });
      setAllMistakes((prev) =>
        [...prev, newMistake].sort((a, b) =>
          a.name.localeCompare(b.name, "fr"),
        ),
      );
      await addMistakeToTrade({
        tradeId,
        mistakeId: newMistake.id,
        notes: pendingNote.trim() || null,
      });
      setTradeMistakes((prev) => [
        ...prev,
        {
          tradeId,
          mistakeId: newMistake.id,
          notes: pendingNote.trim() || null,
          createdAt: new Date().toISOString(),
          mistakeName: newMistake.name,
        },
      ]);
      notify.success(`"${newMistake.name}" créée et ajoutée`);
      setInputValue("");
      setPendingNote("");
      setShowDropdown(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(`Impossible de créer l'erreur : ${msg}`);
    } finally {
      setAdding(false);
    }
  }

  // ── Retirer une erreur du trade ───────────────────────

  async function handleRemove(mistakeId: number, name: string) {
    setRemovingId(mistakeId);
    try {
      await removeMistakeFromTrade(tradeId, mistakeId);
      setTradeMistakes((prev) =>
        prev.filter((tm) => tm.mistakeId !== mistakeId),
      );
      // Fermer l'édition de note si c'était cet élément
      if (editingNoteId === mistakeId) setEditingNoteId(null);
    } catch {
      notify.error(`Impossible de retirer "${name}"`);
    } finally {
      setRemovingId(null);
    }
  }

  // ── Ouvrir / fermer l'édition de note inline ──────────

  function openNoteEdit(tm: TradeMistake) {
    setEditingNoteId(tm.mistakeId);
    setEditingNoteValue(tm.notes ?? "");
  }

  function closeNoteEdit() {
    setEditingNoteId(null);
    setEditingNoteValue("");
  }

  // ── Sauvegarder la note inline ────────────────────────

  async function saveNoteEdit(tm: TradeMistake) {
    setSavingNoteId(tm.mistakeId);
    try {
      await addMistakeToTrade({
        tradeId,
        mistakeId: tm.mistakeId,
        notes: editingNoteValue.trim() || null,
      });
      setTradeMistakes((prev) =>
        prev.map((x) =>
          x.mistakeId === tm.mistakeId
            ? { ...x, notes: editingNoteValue.trim() || null }
            : x,
        ),
      );
      closeNoteEdit();
    } catch {
      notify.error("Impossible de sauvegarder la note");
    } finally {
      setSavingNoteId(null);
    }
  }

  // ── Clavier ───────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length === 1 && !showCreateOption) {
        void handleSelect(suggestions[0]);
      } else if (exactMatch) {
        void handleSelect(exactMatch);
      } else {
        void handleCreate();
      }
    }
  }

  // ── JSX ───────────────────────────────────────────────

  return (
    <section
      className="card mistakes-section"
      aria-labelledby="mistakes-section-title"
    >
      <h2 className="trade-detail-section-title" id="mistakes-section-title">
        <AlertTriangle size={14} aria-hidden />
        Erreurs commises
      </h2>

      {loading ? (
        <p className="mistakes-empty">Chargement…</p>
      ) : (
        <>
          {/* ── Liste des erreurs ────────────────────── */}
          {tradeMistakes.length === 0 ? (
            <p className="mistakes-empty">
              Aucune erreur enregistrée pour ce trade.
            </p>
          ) : (
            <ul className="mistake-chips" role="list">
              {tradeMistakes.map((tm) => {
                const isEditingNote = editingNoteId === tm.mistakeId;
                const isRemoving = removingId === tm.mistakeId;
                const isSavingNote = savingNoteId === tm.mistakeId;
                return (
                  <li key={tm.mistakeId} className="mistake-chip-wrapper">
                    {/* ── Chip principale ──────────── */}
                    <div className="mistake-chip">
                      {/* Nom cliquable pour éditer la note */}
                      <button
                        type="button"
                        className="mistake-chip__name"
                        onClick={() =>
                          isEditingNote ? closeNoteEdit() : openNoteEdit(tm)
                        }
                        aria-expanded={isEditingNote}
                        aria-controls={`mistake-note-${tm.mistakeId}`}
                        title={
                          isEditingNote
                            ? "Fermer la note"
                            : tm.notes
                              ? `Note : ${tm.notes}`
                              : "Ajouter une note"
                        }
                      >
                        {tm.mistakeName ?? `#${tm.mistakeId}`}
                        {/* Indicateur visuel si une note existe */}
                        {tm.notes && !isEditingNote && (
                          <span
                            className="mistake-chip__note-indicator"
                            aria-label="Note ajoutée"
                          />
                        )}
                      </button>

                      {/* Bouton × suppression */}
                      <button
                        type="button"
                        className="mistake-chip__remove"
                        onClick={() =>
                          handleRemove(
                            tm.mistakeId,
                            tm.mistakeName ?? String(tm.mistakeId),
                          )
                        }
                        disabled={isRemoving || isEditingNote}
                        aria-label={`Retirer "${tm.mistakeName ?? ""}"`}
                      >
                        <X size={10} aria-hidden />
                      </button>
                    </div>

                    {/* ── Zone d'édition de note inline ── */}
                    {isEditingNote && (
                      <div
                        id={`mistake-note-${tm.mistakeId}`}
                        className="mistake-note-editor"
                      >
                        <textarea
                          className="mistake-note-textarea"
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          placeholder="Contexte de cette erreur sur ce trade… (optionnel)"
                          maxLength={500}
                          rows={2}
                          disabled={isSavingNote}
                          aria-label="Note sur l'erreur"
                          autoFocus
                        />
                        <div className="mistake-note-editor__actions">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => void saveNoteEdit(tm)}
                            disabled={isSavingNote}
                          >
                            {isSavingNote ? "Sauvegarde…" : "Enregistrer"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={closeNoteEdit}
                            disabled={isSavingNote}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* ── Formulaire d'ajout ───────────────────── */}
          <div className="mistakes-add">
            {/* Champ de recherche / création */}
            <div className="mistakes-input-area" ref={wrapperRef}>
              <input
                ref={inputRef}
                type="text"
                className="mistakes-input"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                placeholder="Rechercher ou créer une erreur…"
                maxLength={100}
                disabled={adding}
                aria-label="Rechercher ou créer une erreur"
                aria-expanded={showDropdown}
                aria-haspopup="listbox"
                autoComplete="off"
              />

              {/* Dropdown de suggestions */}
              {showDropdown && (suggestions.length > 0 || showCreateOption) && (
                <ul
                  className="mistakes-dropdown"
                  role="listbox"
                  aria-label="Suggestions d'erreurs"
                >
                  {suggestions.map((mistake) => {
                    const already = existingIds.has(mistake.id);
                    return (
                      <li
                        key={mistake.id}
                        role="option"
                        aria-selected={false}
                        className={`mistakes-dropdown__item ${already ? "mistakes-dropdown__item--update" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void handleSelect(mistake);
                        }}
                      >
                        <span className="mistakes-dropdown__name">
                          {mistake.name}
                        </span>
                        {already && (
                          <span className="mistakes-dropdown__hint">
                            Déjà ajoutée
                          </span>
                        )}
                        {mistake.description && !already && (
                          <span className="mistakes-dropdown__desc">
                            {mistake.description}
                          </span>
                        )}
                      </li>
                    );
                  })}

                  {showCreateOption && (
                    <li
                      role="option"
                      aria-selected={false}
                      className="mistakes-dropdown__item mistakes-dropdown__item--create"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void handleCreate();
                      }}
                    >
                      Créer &laquo;&nbsp;{trimmed}&nbsp;&raquo;
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Champ de note optionnel pour le prochain ajout */}
            <textarea
              className="mistakes-add__note"
              value={pendingNote}
              onChange={(e) => setPendingNote(e.target.value)}
              placeholder="Note optionnelle sur cette erreur…"
              maxLength={500}
              rows={2}
              disabled={adding}
              aria-label="Note optionnelle"
            />
          </div>
        </>
      )}
    </section>
  );
}
