// ============================================================
// Service — Notes de trade (validation + logique métier)
// ============================================================

import { createLogger } from "../logging";
import { logActivity } from "../activity/activityService";
import { validate, NoteContentSchema } from "../../validation";
import * as repo from "../../repositories/notesRepository";

// Ré-export du type pour compatibilité descendante
export type { TradeNote } from "../../repositories/notesRepository";
import type { TradeNote } from "../../repositories/notesRepository";

const logger = createLogger("notes");

export async function createNote(tradeId: number, content: string): Promise<TradeNote> {
  validate(NoteContentSchema, content);
  const note = await repo.insertNote(tradeId, content);
  logger.info(`Note créée : id=${note.id} trade=${tradeId}`);
  void logActivity({
    tradeId,
    action: "note_added",
    description: "Note ajoutée",
  }).catch(() => {});
  return note;
}

export async function getNoteById(id: number): Promise<TradeNote | null> {
  return repo.findNoteById(id);
}

export async function getNotesForTrade(tradeId: number): Promise<TradeNote[]> {
  return repo.findNotesByTradeId(tradeId);
}

export async function updateNote(id: number, content: string): Promise<TradeNote | null> {
  validate(NoteContentSchema, content);
  const note = await repo.updateNoteById(id, content);
  // updateNoteById retourne la note mise à jour avec tradeId
  if (note) {
    void logActivity({
      tradeId: note.tradeId,
      action: "note_updated",
      description: "Note modifiée",
    }).catch(() => {});
  }
  return note;
}

/** Supprime une note. Retourne true si la note existait. */
export async function deleteNote(id: number): Promise<boolean> {
  // Charger la note avant suppression pour récupérer tradeId
  const note = await repo.findNoteById(id).catch(() => null);
  const deleted = await repo.deleteNoteById(id);
  if (deleted && note) {
    void logActivity({
      tradeId: note.tradeId,
      action: "note_deleted",
      description: "Note supprimée",
    }).catch(() => {});
  }
  return deleted;
}

/** Supprime toutes les notes d'un trade. */
export async function deleteNotesForTrade(tradeId: number): Promise<void> {
  return repo.deleteNotesByTradeId(tradeId);
}
