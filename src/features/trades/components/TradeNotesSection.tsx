// ============================================================
// TradeNotesSection — Gestion des notes d'un trade
// ============================================================
// Fonctionnalités :
//   - Chargement des notes existantes depuis SQLite
//   - Ajout d'une nouvelle note via textarea
//   - Modification inline d'une note
//   - Suppression avec ConfirmDialog
//
// Flux :
//   UI → createNote / updateNote / deleteNote (service)
//     → notesRepository → SQLite (table trade_notes)
//
// Les notes sont triées par date de création croissante
// (oldest first) afin de lire le journal dans l'ordre chronologique.
// ============================================================

import { useState, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  createNote,
  getNotesForTrade,
  updateNote,
  deleteNote,
} from "../../../services/notes/notesService";
import type { TradeNote } from "../../../services/notes/notesService";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useNotification, useUserSettings } from "../../../hooks";
import {
  formatDateTimeForSettings,
  formatNumberForSettings,
} from "../../../services/settings/settingsFormatService";
import { ValidationError } from "../../../validation";

// ─── Constantes ────────────────────────────────────────────

/** Limite de caractères — identique à NoteContentSchema. */
const MAX_CHARS = 10_000;
const NEW_NOTE_DRAFT_KEY_PREFIX = "trade-notes:new-content:";

// ─── Props ─────────────────────────────────────────────────

interface TradeNotesSectionProps {
  /** Identifiant du trade parent. */
  tradeId: number;
}

// ─── Helper date ───────────────────────────────────────────

function formatNoteDate(
  iso: string,
  settings: ReturnType<typeof useUserSettings>,
): string {
  return formatDateTimeForSettings(iso, settings, iso);
}

// ─── Composant ─────────────────────────────────────────────

export default function TradeNotesSection({ tradeId }: TradeNotesSectionProps) {
  const notify = useNotification();
  const settings = useUserSettings();

  // ── État ─────────────────────────────────────────────────

  /** Liste des notes du trade. */
  const [notes, setNotes] = useState<TradeNote[]>([]);
  const [loading, setLoading] = useState(true);

  /** Contenu de la nouvelle note en cours de saisie. */
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);

  /** ID de la note en cours d'édition inline. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  /** Note ciblée pour suppression (null = dialogue fermé). */
  const [deleteTarget, setDeleteTarget] = useState<TradeNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Persistance brouillon (nouvelle note) ───────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = `${NEW_NOTE_DRAFT_KEY_PREFIX}${tradeId}`;
    const savedDraft = window.localStorage.getItem(storageKey);
    if (savedDraft) setNewContent(savedDraft);
  }, [tradeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = `${NEW_NOTE_DRAFT_KEY_PREFIX}${tradeId}`;
    if (newContent.trim().length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, newContent);
  }, [tradeId, newContent]);

  // ── Chargement initial ───────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    getNotesForTrade(tradeId)
      .then((data) => {
        if (!cancelled) setNotes(data);
      })
      .catch(() => {
        if (!cancelled) notify.error("Impossible de charger les notes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  // ── Ajout d'une note ─────────────────────────────────────

  async function handleAdd() {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      const note = await createNote(tradeId, trimmed);
      setNotes((prev) => [...prev, note]);
      setNewContent("");

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(
          `${NEW_NOTE_DRAFT_KEY_PREFIX}${tradeId}`,
        );
      }

      notify.success("Note ajoutée");
    } catch (err) {
      if (err instanceof ValidationError) {
        notify.error(err.issues[0] ?? "Note invalide");
      } else {
        notify.error("Impossible d'ajouter la note");
      }
    } finally {
      setAdding(false);
    }
  }

  // ── Édition inline ───────────────────────────────────────

  function startEditing(note: TradeNote) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditContent("");
  }

  async function handleSaveEdit(id: number) {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const updated = await updateNote(id, trimmed);
      if (updated) {
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        notify.success("Note mise à jour");
      }
      cancelEditing();
    } catch (err) {
      if (err instanceof ValidationError) {
        notify.error(err.issues[0] ?? "Note invalide");
      } else {
        notify.error("Impossible de modifier la note");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Suppression ──────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await deleteNote(deleteTarget.id);
      setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      notify.success("Note supprimée");
      setDeleteTarget(null);
    } catch {
      notify.error("Impossible de supprimer la note");
    } finally {
      setDeleting(false);
    }
  }

  // ── JSX ──────────────────────────────────────────────────

  return (
    <section className="card notes-section" aria-labelledby="notes-title">
      <h2 className="trade-detail-section-title" id="notes-title">
        Notes
      </h2>

      {/* ── Zone d'ajout ─────────────────────────────── */}
      <div className="notes-add">
        <textarea
          className="notes-add__textarea"
          placeholder="Ajoutez une note : analyse, émotions, leçons apprises, respect du plan…"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
          maxLength={MAX_CHARS}
          disabled={adding}
          aria-label="Nouvelle note"
        />
        <div className="notes-add__footer">
          <span className="notes-add__chars">
            {formatNumberForSettings(newContent.length, settings)} /{" "}
            {formatNumberForSettings(MAX_CHARS, settings)}
          </span>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAdd}
            disabled={adding || !newContent.trim()}
          >
            {adding ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </div>

      {/* ── Liste des notes ───────────────────────────── */}
      {loading ? (
        <p className="notes-empty">Chargement des notes…</p>
      ) : notes.length === 0 ? (
        <p className="notes-empty">
          Aucune note pour ce trade.
          <br />
          <span className="notes-empty__hint">
            Documentez vos raisons d'entrée, émotions ou leçons apprises.
          </span>
        </p>
      ) : (
        <ul className="notes-list" role="list">
          {notes.map((note) => (
            <li key={note.id} className="note-card">
              {/* En-tête : date + boutons d'action */}
              <div className="note-card__header">
                <time className="note-card__date" dateTime={note.updatedAt}>
                  {note.updatedAt !== note.createdAt
                    ? `Modifié le ${formatNoteDate(note.updatedAt, settings)}`
                    : formatNoteDate(note.createdAt, settings)}
                </time>

                {/* Boutons Edit / Delete — masqués pendant l'édition */}
                {editingId !== note.id && (
                  <div className="note-card__actions">
                    <button
                      type="button"
                      className="btn-ghost btn-icon-text"
                      onClick={() => startEditing(note)}
                      aria-label="Modifier cette note"
                    >
                      <Pencil size={13} aria-hidden />
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-icon-text note-card__delete-btn"
                      onClick={() => setDeleteTarget(note)}
                      aria-label="Supprimer cette note"
                    >
                      <Trash2 size={13} aria-hidden />
                      Supprimer
                    </button>
                  </div>
                )}
              </div>

              {/* Contenu ou textarea d'édition */}
              {editingId === note.id ? (
                <div className="note-card__edit-area">
                  <textarea
                    className="notes-add__textarea"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    maxLength={MAX_CHARS}
                    disabled={saving}
                    aria-label="Modifier le contenu de la note"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                  <div className="note-card__edit-footer">
                    <span className="notes-add__chars">
                      {formatNumberForSettings(editContent.length, settings)} /{" "}
                      {formatNumberForSettings(MAX_CHARS, settings)}
                    </span>
                    <div className="note-card__edit-btns">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={cancelEditing}
                        disabled={saving}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={saving || !editContent.trim()}
                      >
                        {saving ? "Sauvegarde…" : "Sauvegarder"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="note-card__content">{note.content}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Dialogue de confirmation suppression ──────── */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer la note"
        message="Voulez-vous vraiment supprimer cette note ? Cette action est irréversible."
        confirmLabel="Supprimer"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
