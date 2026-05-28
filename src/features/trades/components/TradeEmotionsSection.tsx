// ============================================================
// TradeEmotionsSection — Émotions associées à un trade
// ============================================================
// Fonctionnalités :
//   - Affiche les émotions du trade groupées par phase
//     (Avant / Pendant / Après le trade)
//   - Associe une émotion existante via un menu de recherche
//   - Crée une nouvelle émotion à la volée si elle n'existe pas
//   - Configure la phase et l'intensité (1–5) avant d'ajouter
//   - Retire une émotion via le bouton ×
//
// Architecture de données (deux tables distinctes) :
//   - `emotions`       : catalogue global des émotions (réutilisables)
//   - `trade_emotions` : liaison (trade_id, emotion_id, phase) — PK composite
//
// Clé unique d'une entrée : (emotionId + phase)
//   → La même émotion peut être enregistrée pour plusieurs phases
//     (ex : "confiant" avant ET après)
//   → Pour supprimer, les 3 champs (tradeId, emotionId, phase) sont requis
//
// Règles métier :
//   - INSERT OR REPLACE : remplace si (trade, emotion, phase) existe déjà
//   - Supprimer un trade → supprime seulement ses trade_emotions (ON DELETE CASCADE)
//   - Les émotions du catalogue restent intactes
//   - Le nom est trimmé et la casse est comparée insensiblement (déduplication)
//
// Services utilisés :
//   - emotionsService.getEmotions()          → catalogue global
//   - emotionsService.getEmotionsForTrade()  → émotions du trade courant
//   - emotionsService.createEmotion()        → crée + valide via Zod
//   - emotionsService.addEmotionToTrade()    → insère dans trade_emotions
//   - emotionsService.removeEmotionFromTrade()  → supprime de trade_emotions
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Heart } from "lucide-react";
import {
  getEmotions,
  getEmotionsForTrade,
  createEmotion,
  addEmotionToTrade,
  removeEmotionFromTrade,
} from "../../../services/emotions/emotionsService";
import type { Emotion, TradeEmotion, EmotionPhase } from "../../../types";
import { useNotification } from "../../../hooks";

// ─── Constantes ───────────────────────────────────────────

/** Libellés des phases en français. */
const PHASE_LABELS: Record<EmotionPhase, string> = {
  before: "Avant",
  during: "Pendant",
  after: "Après",
};

/** Ordre d'affichage des phases. */
const PHASE_ORDER: EmotionPhase[] = ["before", "during", "after"];

/** Couleurs CSS par phase pour les en-têtes de groupe. */
const PHASE_COLORS: Record<EmotionPhase, string> = {
  before: "var(--color-accent)",
  during: "var(--color-warning)",
  after: "var(--color-positive)",
};

// ─── Props ────────────────────────────────────────────────

interface TradeEmotionsSectionProps {
  /** Identifiant du trade parent. */
  tradeId: number;
}

// ─── Sous-composant : sélecteur d'intensité (1–5 cercles) ─

interface IntensitySelectorProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function IntensitySelector({
  value,
  onChange,
  disabled,
}: IntensitySelectorProps) {
  return (
    <div
      className="emotion-intensity"
      role="group"
      aria-label="Intensité de l'émotion"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`emotion-intensity__dot ${n <= value ? "emotion-intensity__dot--active" : ""}`}
          onClick={() => onChange(n)}
          disabled={disabled}
          aria-label={`Intensité ${n}`}
          aria-pressed={n === value}
          title={`Intensité ${n}`}
        />
      ))}
    </div>
  );
}

// ─── Sous-composant : chips par phase ─────────────────────

interface EmotionGroupProps {
  phase: EmotionPhase;
  items: TradeEmotion[];
  removingKey: string | null;
  onRemove: (emotionId: number, phase: EmotionPhase) => void;
}

function EmotionGroup({
  phase,
  items,
  removingKey,
  onRemove,
}: EmotionGroupProps) {
  if (items.length === 0) return null;

  return (
    <div className="emotion-group">
      <span
        className="emotion-group__label"
        style={{ color: PHASE_COLORS[phase] }}
      >
        {PHASE_LABELS[phase]}
      </span>
      <ul className="emotion-chips" role="list">
        {items.map((te) => {
          const key = `${te.emotionId}-${te.phase}`;
          const isRemoving = removingKey === key;
          return (
            <li key={key} className="emotion-chip">
              <span className="emotion-chip__name">
                {te.emotionName ?? `#${te.emotionId}`}
              </span>
              {/* Indicateur d'intensité miniature (cercles remplis) */}
              <span
                className="emotion-chip__intensity"
                aria-label={`Intensité ${te.intensity}`}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`emotion-chip__dot ${n <= te.intensity ? "emotion-chip__dot--active" : ""}`}
                    aria-hidden
                  />
                ))}
              </span>
              <button
                type="button"
                className="emotion-chip__remove"
                onClick={() => onRemove(te.emotionId, te.phase)}
                disabled={isRemoving}
                aria-label={`Retirer ${te.emotionName ?? ""} (${PHASE_LABELS[phase]})`}
              >
                <X size={10} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────

export default function TradeEmotionsSection({
  tradeId,
}: TradeEmotionsSectionProps) {
  const notify = useNotification();

  // ── État ─────────────────────────────────────────────

  /** Émotions actuellement associées à ce trade. */
  const [tradeEmotions, setTradeEmotions] = useState<TradeEmotion[]>([]);
  /** Catalogue global de toutes les émotions disponibles. */
  const [allEmotions, setAllEmotions] = useState<Emotion[]>([]);
  const [loading, setLoading] = useState(true);

  /** Saisie dans le champ de recherche / création. */
  const [inputValue, setInputValue] = useState("");
  /** Phase sélectionnée pour le prochain ajout. */
  const [selectedPhase, setSelectedPhase] = useState<EmotionPhase>("during");
  /** Intensité sélectionnée pour le prochain ajout. */
  const [selectedIntensity, setSelectedIntensity] = useState(3);
  /** Afficher le menu déroulant de suggestions. */
  const [showDropdown, setShowDropdown] = useState(false);

  /** Opération d'ajout en cours. */
  const [adding, setAdding] = useState(false);
  /** Clé `${emotionId}-${phase}` de l'entrée en cours de suppression. */
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Chargement initial ────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([getEmotionsForTrade(tradeId), getEmotions()])
      .then(([te, all]) => {
        if (cancelled) return;
        setTradeEmotions(te);
        setAllEmotions(all);
      })
      .catch(() => {
        if (!cancelled) notify.error("Impossible de charger les émotions");
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

  /**
   * Clés déjà utilisées pour (emotionId, selectedPhase).
   * Si la même paire existe → INSERT OR REPLACE met à jour l'intensité.
   * On ne cache pas le tag, on le montre comme "mettre à jour".
   */
  const existingKeys = new Set(
    tradeEmotions.map((te) => `${te.emotionId}-${te.phase}`),
  );

  /** Suggestions : nom contient la saisie, pas encore dans le catalogue local vide. */
  const suggestions = allEmotions.filter(
    (e) => trimmedLower === "" || e.name.toLowerCase().includes(trimmedLower),
  );

  /** Correspondance exacte (insensible à la casse) dans le catalogue global. */
  const existingMatch = allEmotions.find(
    (e) => e.name.toLowerCase() === trimmedLower,
  );

  /** Afficher l'option "Créer '…'" seulement si aucune correspondance exacte. */
  const showCreateOption = trimmed.length > 0 && !existingMatch;

  // ── Vérifier si (emotion, phase) est déjà enregistrée ─

  function isAlreadyOnTrade(emotionId: number, phase: EmotionPhase): boolean {
    return existingKeys.has(`${emotionId}-${phase}`);
  }

  // ── Associer une émotion existante ────────────────────

  const handleSelect = useCallback(
    async (emotion: Emotion) => {
      setAdding(true);
      try {
        await addEmotionToTrade({
          tradeId,
          emotionId: emotion.id,
          phase: selectedPhase,
          intensity: selectedIntensity,
        });

        // Mettre à jour l'état local : INSERT OR REPLACE → remplacer si existant
        const newEntry: TradeEmotion = {
          tradeId,
          emotionId: emotion.id,
          intensity: selectedIntensity,
          phase: selectedPhase,
          createdAt: new Date().toISOString(),
          emotionName: emotion.name,
        };
        setTradeEmotions((prev) => [
          ...prev.filter(
            (te) =>
              !(te.emotionId === emotion.id && te.phase === selectedPhase),
          ),
          newEntry,
        ]);

        setInputValue("");
        setShowDropdown(false);
        const action = isAlreadyOnTrade(emotion.id, selectedPhase)
          ? "mise à jour"
          : "ajoutée";
        notify.success(
          `"${emotion.name}" (${PHASE_LABELS[selectedPhase]}) ${action}`,
        );
      } catch {
        notify.error(`Impossible d'associer "${emotion.name}"`);
      } finally {
        setAdding(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tradeId, selectedPhase, selectedIntensity],
  );

  // ── Créer puis associer une nouvelle émotion ─────────

  async function handleCreate() {
    if (!trimmed) return;

    // Réutiliser si correspondance insensible à la casse
    if (existingMatch) {
      await handleSelect(existingMatch);
      return;
    }

    setAdding(true);
    try {
      const newEmotion = await createEmotion({ name: trimmed });
      setAllEmotions((prev) =>
        [...prev, newEmotion].sort((a, b) =>
          a.name.localeCompare(b.name, "fr"),
        ),
      );
      await addEmotionToTrade({
        tradeId,
        emotionId: newEmotion.id,
        phase: selectedPhase,
        intensity: selectedIntensity,
      });
      const newEntry: TradeEmotion = {
        tradeId,
        emotionId: newEmotion.id,
        intensity: selectedIntensity,
        phase: selectedPhase,
        createdAt: new Date().toISOString(),
        emotionName: newEmotion.name,
      };
      setTradeEmotions((prev) => [...prev, newEntry]);
      setInputValue("");
      setShowDropdown(false);
      notify.success(`"${newEmotion.name}" créée et ajoutée`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(`Impossible de créer l'émotion : ${msg}`);
    } finally {
      setAdding(false);
    }
  }

  // ── Retirer une émotion du trade ──────────────────────

  async function handleRemove(emotionId: number, phase: EmotionPhase) {
    const key = `${emotionId}-${phase}`;
    setRemovingKey(key);
    try {
      await removeEmotionFromTrade(tradeId, emotionId, phase);
      setTradeEmotions((prev) =>
        prev.filter(
          (te) => !(te.emotionId === emotionId && te.phase === phase),
        ),
      );
    } catch {
      notify.error("Impossible de retirer l'émotion");
    } finally {
      setRemovingKey(null);
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
      if (suggestions.length > 0 && !showCreateOption) {
        void handleSelect(suggestions[0]);
      } else {
        void handleCreate();
      }
    }
  }

  // ── Grouper les émotions par phase ────────────────────

  const byPhase = PHASE_ORDER.reduce<Record<EmotionPhase, TradeEmotion[]>>(
    (acc, p) => {
      acc[p] = tradeEmotions.filter((te) => te.phase === p);
      return acc;
    },
    { before: [], during: [], after: [] },
  );

  const hasAny = tradeEmotions.length > 0;

  // ── JSX ───────────────────────────────────────────────

  return (
    <section
      className="card emotions-section"
      aria-labelledby="emotions-section-title"
    >
      <h2 className="trade-detail-section-title" id="emotions-section-title">
        <Heart size={14} aria-hidden />
        Émotions
      </h2>

      {loading ? (
        <p className="emotions-empty">Chargement…</p>
      ) : (
        <>
          {/* ── Chips par phase ─────────────────────── */}
          {!hasAny ? (
            <p className="emotions-empty">
              Aucune émotion enregistrée pour ce trade.
            </p>
          ) : (
            <div className="emotions-groups">
              {PHASE_ORDER.map((p) => (
                <EmotionGroup
                  key={p}
                  phase={p}
                  items={byPhase[p]}
                  removingKey={removingKey}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}

          {/* ── Formulaire d'ajout ───────────────────── */}
          <div className="emotions-add">
            {/* Sélecteur de phase */}
            <div
              className="emotions-phase-selector"
              role="group"
              aria-label="Phase"
            >
              {PHASE_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`emotions-phase-btn ${selectedPhase === p ? "emotions-phase-btn--active" : ""}`}
                  style={
                    selectedPhase === p
                      ? { borderColor: PHASE_COLORS[p], color: PHASE_COLORS[p] }
                      : undefined
                  }
                  onClick={() => setSelectedPhase(p)}
                  aria-pressed={selectedPhase === p}
                >
                  {PHASE_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Sélecteur d'intensité */}
            <div className="emotions-add__intensity-row">
              <span className="emotions-add__intensity-label">Intensité :</span>
              <IntensitySelector
                value={selectedIntensity}
                onChange={setSelectedIntensity}
                disabled={adding}
              />
            </div>

            {/* Champ de recherche / création + dropdown */}
            <div className="emotions-input-area" ref={wrapperRef}>
              <input
                ref={inputRef}
                type="text"
                className="emotions-input"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                placeholder="Rechercher ou créer une émotion…"
                maxLength={50}
                disabled={adding}
                aria-label="Rechercher ou créer une émotion"
                aria-expanded={showDropdown}
                aria-haspopup="listbox"
                autoComplete="off"
              />

              {showDropdown && (suggestions.length > 0 || showCreateOption) && (
                <ul
                  className="emotions-dropdown"
                  role="listbox"
                  aria-label="Suggestions d'émotions"
                >
                  {suggestions.map((emotion) => {
                    const alreadyAdded = isAlreadyOnTrade(
                      emotion.id,
                      selectedPhase,
                    );
                    return (
                      <li
                        key={emotion.id}
                        role="option"
                        aria-selected={false}
                        className={`emotions-dropdown__item ${alreadyAdded ? "emotions-dropdown__item--update" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void handleSelect(emotion);
                        }}
                      >
                        <span className="emotions-dropdown__name">
                          {emotion.name}
                        </span>
                        {alreadyAdded && (
                          <span className="emotions-dropdown__hint">
                            Mettre à jour
                          </span>
                        )}
                      </li>
                    );
                  })}

                  {showCreateOption && (
                    <li
                      role="option"
                      aria-selected={false}
                      className="emotions-dropdown__item emotions-dropdown__item--create"
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
          </div>
        </>
      )}
    </section>
  );
}
