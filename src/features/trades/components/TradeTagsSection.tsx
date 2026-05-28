// ============================================================
// TradeTagsSection — Tags associés à un trade
// ============================================================
// Fonctionnalités :
//   - Affiche les tags actuels du trade sous forme de chips colorées
//   - Permet d'associer un tag existant via un menu déroulant de recherche
//   - Permet de créer un nouveau tag (nom + couleur) à la volée
//   - Permet de retirer un tag du trade via le bouton × sur chaque chip
//
// Architecture de données (deux tables distinctes) :
//   - `tags`        : catalogue global des tags (réutilisables entre trades)
//   - `trade_tags`  : liaison many-to-many (trade_id, tag_id) — PK composite
//
// Règles métier :
//   - Un tag ne peut être associé qu'une seule fois à un trade (INSERT OR IGNORE)
//   - Nom normalisé : trim() avant validation/création
//   - Nom case-insensitive dédupliqué : si un tag existe avec le même nom
//     (ex : "FOMO" et "fomo"), on réutilise l'existant au lieu de créer
//   - Supprimer un tag du trade → retire uniquement la liaison dans trade_tags
//     (le tag global dans la table tags est conservé pour les autres trades)
//   - Supprimer un tag global → cascade supprime ses liaisons trade_tags
//
// Services utilisés :
//   - tagsService.getTags()             → tous les tags disponibles
//   - tagsService.getTagsForTrade()     → tags du trade courant
//   - tagsService.createTag()           → crée un tag global + valide via Zod
//   - tagsService.addTagToTrade()       → insère dans trade_tags (idempotent)
//   - tagsService.removeTagFromTrade()  → supprime de trade_tags
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Tag as TagIcon } from "lucide-react";
import {
  getTags,
  getTagsForTrade,
  createTag,
  addTagToTrade,
  removeTagFromTrade,
} from "../../../services/tags/tagsService";
import type { Tag } from "../../../types";
import { useNotification } from "../../../hooks";

// ─── Palette de couleurs prédéfinies pour les nouveaux tags ──

const TAG_COLORS: { value: string; label: string }[] = [
  { value: "#6366f1", label: "Violet" },
  { value: "#10b981", label: "Vert" },
  { value: "#f59e0b", label: "Ambre" },
  { value: "#ef4444", label: "Rouge" },
  { value: "#3b82f6", label: "Bleu" },
  { value: "#ec4899", label: "Rose" },
  { value: "#8b5cf6", label: "Mauve" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#f97316", label: "Orange" },
  { value: "#84cc16", label: "Lime" },
];

const DEFAULT_COLOR = TAG_COLORS[0].value;

// ─── Props ────────────────────────────────────────────────

interface TradeTagsSectionProps {
  /** Identifiant du trade parent. */
  tradeId: number;
}

// ─── Composant ────────────────────────────────────────────

export default function TradeTagsSection({ tradeId }: TradeTagsSectionProps) {
  const notify = useNotification();

  // ── État ───────────────────────────────────────────────

  /** Tags actuellement associés à ce trade. */
  const [tradeTags, setTradeTags] = useState<Tag[]>([]);
  /** Catalogue global de tous les tags disponibles. */
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  /** Valeur saisie dans le champ de recherche / création. */
  const [inputValue, setInputValue] = useState("");
  /** Couleur sélectionnée pour la création d'un nouveau tag. */
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR);
  /** Afficher ou non le menu déroulant de suggestions. */
  const [showDropdown, setShowDropdown] = useState(false);

  /** ID du tag en cours de suppression (pour désactiver le bouton × pendant l'opération). */
  const [removingId, setRemovingId] = useState<number | null>(null);
  /** Opération d'ajout en cours (désactive le champ pendant l'opération). */
  const [adding, setAdding] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Chargement initial ────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([getTagsForTrade(tradeId), getTags()])
      .then(([tradeTagList, all]) => {
        if (cancelled) return;
        setTradeTags(tradeTagList);
        setAllTags(all);
      })
      .catch(() => {
        if (!cancelled) notify.error("Impossible de charger les tags");
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
    function handleOutsideClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // ── Calculs dérivés ───────────────────────────────────

  const tradeTagIds = new Set(tradeTags.map((t) => t.id));
  const trimmed = inputValue.trim();
  const trimmedLower = trimmed.toLowerCase();

  /**
   * Suggestions filtrées :
   * - nom contient la saisie (insensible à la casse)
   * - tag pas encore associé à ce trade
   */
  const suggestions = allTags.filter(
    (t) =>
      !tradeTagIds.has(t.id) &&
      (trimmedLower === "" || t.name.toLowerCase().includes(trimmedLower)),
  );

  /**
   * Un tag avec exactement ce nom existe-t-il déjà dans le catalogue ?
   * (comparaison insensible à la casse)
   */
  const existingTagMatch = allTags.find(
    (t) => t.name.toLowerCase() === trimmedLower,
  );

  /**
   * Afficher l'option "Créer le tag '…'" seulement si :
   * - la saisie n'est pas vide
   * - aucun tag ne porte exactement ce nom
   */
  const showCreateOption = trimmed.length > 0 && !existingTagMatch;

  // ── Associer un tag existant à ce trade ──────────────

  const handleSelect = useCallback(
    async (tag: Tag) => {
      if (tradeTagIds.has(tag.id)) return; // déjà associé
      setAdding(true);
      try {
        await addTagToTrade(tradeId, tag.id);
        setTradeTags((prev) => [...prev, tag]);
        setInputValue("");
        setShowDropdown(false);
      } catch {
        notify.error(`Impossible d'associer le tag "${tag.name}"`);
      } finally {
        setAdding(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tradeId, tradeTagIds],
  );

  // ── Créer un nouveau tag puis l'associer ─────────────

  async function handleCreate() {
    const name = trimmed;
    if (!name) return;

    // Si un tag avec ce nom (casse ignorée) existe déjà → associer l'existant
    if (existingTagMatch) {
      await handleSelect(existingTagMatch);
      return;
    }

    setAdding(true);
    try {
      // createTag() valide via CreateTagInputSchema (Zod)
      const newTag = await createTag({ name, color: selectedColor });

      // Mise à jour du catalogue global (tri alphabétique)
      setAllTags((prev) =>
        [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name, "fr")),
      );

      // Association immédiate au trade
      await addTagToTrade(tradeId, newTag.id);
      setTradeTags((prev) => [...prev, newTag]);

      setInputValue("");
      setSelectedColor(DEFAULT_COLOR);
      setShowDropdown(false);
      notify.success(`Tag "${name}" créé et associé`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(`Impossible de créer le tag : ${msg}`);
    } finally {
      setAdding(false);
    }
  }

  // ── Retirer un tag du trade ───────────────────────────

  async function handleRemove(tagId: number) {
    setRemovingId(tagId);
    try {
      await removeTagFromTrade(tradeId, tagId);
      setTradeTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch {
      notify.error("Impossible de retirer le tag");
    } finally {
      setRemovingId(null);
    }
  }

  // ── Gestion clavier dans le champ ────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Si le premier résultat correspond exactement → le sélectionner
      if (suggestions.length > 0 && !showCreateOption) {
        void handleSelect(suggestions[0]);
      } else {
        void handleCreate();
      }
    }
  }

  // ── JSX ──────────────────────────────────────────────

  return (
    <section className="card tags-section" aria-labelledby="tags-section-title">
      <h2 className="trade-detail-section-title" id="tags-section-title">
        <TagIcon size={14} aria-hidden />
        Tags
      </h2>

      {loading ? (
        <p className="tags-empty">Chargement…</p>
      ) : (
        <>
          {/* ── Chips des tags actuels ───────────── */}
          {tradeTags.length === 0 ? (
            <p className="tags-empty">Aucun tag associé à ce trade.</p>
          ) : (
            <ul className="tags-chips" role="list" aria-label="Tags du trade">
              {tradeTags.map((tag) => (
                <li
                  key={tag.id}
                  className="tag-chip"
                  style={{ "--tag-color": tag.color } as React.CSSProperties}
                >
                  <span className="tag-chip__dot" aria-hidden />
                  <span className="tag-chip__name">{tag.name}</span>
                  <button
                    type="button"
                    className="tag-chip__remove"
                    onClick={() => handleRemove(tag.id)}
                    disabled={removingId === tag.id}
                    aria-label={`Retirer le tag ${tag.name}`}
                  >
                    <X size={11} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Zone de recherche / création ─────── */}
          <div className="tags-input-area" ref={wrapperRef}>
            <input
              ref={inputRef}
              type="text"
              className="tags-input"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher ou créer un tag…"
              maxLength={50}
              disabled={adding}
              aria-label="Rechercher ou créer un tag"
              aria-expanded={showDropdown}
              aria-haspopup="listbox"
              autoComplete="off"
            />

            {/* Palette de couleurs — visible seulement lors d'une création */}
            {showCreateOption && (
              <div
                className="tags-color-picker"
                role="group"
                aria-label="Couleur du tag"
              >
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`tag-color-swatch ${selectedColor === c.value ? "tag-color-swatch--active" : ""}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setSelectedColor(c.value)}
                    aria-label={`Couleur : ${c.label}`}
                    aria-pressed={selectedColor === c.value}
                    title={c.label}
                  />
                ))}
              </div>
            )}

            {/* Dropdown de suggestions */}
            {showDropdown && (suggestions.length > 0 || showCreateOption) && (
              <ul
                className="tags-dropdown"
                role="listbox"
                aria-label="Suggestions de tags"
              >
                {/* Tags existants filtrés */}
                {suggestions.map((tag) => (
                  <li
                    key={tag.id}
                    role="option"
                    aria-selected={false}
                    className="tags-dropdown__item"
                    onMouseDown={(e) => {
                      // mousedown au lieu de click pour éviter que onBlur ferme le dropdown avant
                      e.preventDefault();
                      void handleSelect(tag);
                    }}
                  >
                    <span
                      className="tags-dropdown__dot"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden
                    />
                    {tag.name}
                  </li>
                ))}

                {/* Option de création — affiché seulement si aucun tag exact */}
                {showCreateOption && (
                  <li
                    role="option"
                    aria-selected={false}
                    className="tags-dropdown__item tags-dropdown__item--create"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void handleCreate();
                    }}
                  >
                    <span
                      className="tags-dropdown__dot"
                      style={{ backgroundColor: selectedColor }}
                      aria-hidden
                    />
                    Créer le tag &laquo;&nbsp;{trimmed}&nbsp;&raquo;
                  </li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
