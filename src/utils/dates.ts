// ============================================================
// Utils — Dates
// ============================================================
// Fonctions utilitaires pour formater et manipuler les dates.
// Utilise date-fns (déjà installé).
// Toutes les dates SQLite sont stockées en ISO 8601 (TEXT).
// ============================================================

import { format, parseISO, isValid, differenceInMinutes, differenceInHours } from "date-fns";
import { fr } from "date-fns/locale";

/** Formats standards utilisés dans l'application. */
export const DATE_FORMAT = "dd/MM/yyyy";
export const DATE_TIME_FORMAT = "dd/MM/yyyy HH:mm";
export const ISO_DATE_FORMAT = "yyyy-MM-dd";
export const ISO_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

/**
 * Formate une date ISO en "dd/MM/yyyy".
 * Retourne "—" si la date est invalide ou null.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? parseISO(date) : date;
  return isValid(d) ? format(d, DATE_FORMAT) : "—";
}

/**
 * Formate une date ISO en "dd/MM/yyyy HH:mm".
 * Retourne "—" si la date est invalide ou null.
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? parseISO(date) : date;
  return isValid(d) ? format(d, DATE_TIME_FORMAT) : "—";
}

/**
 * Retourne la date actuelle au format "yyyy-MM-dd".
 * Utile pour initialiser les champs de formulaire.
 */
export function todayISO(): string {
  return format(new Date(), ISO_DATE_FORMAT);
}

/**
 * Retourne le timestamp ISO complet du moment présent.
 * Équivalent de new Date().toISOString() mais explicite.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Calcule la durée d'un trade en texte lisible.
 * Ex : "2h 30min" | "45min" | "3 jours"
 */
export function tradeDuration(
  openedAt: string,
  closedAt: string | null
): string {
  if (!closedAt) return "Ouvert";
  const open = parseISO(openedAt);
  const close = parseISO(closedAt);
  if (!isValid(open) || !isValid(close)) return "—";

  const totalMinutes = Math.abs(differenceInMinutes(close, open));
  if (totalMinutes < 60) return `${totalMinutes}min`;

  const hours = differenceInHours(close, open);
  if (hours < 24) {
    const mins = totalMinutes - hours * 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * Formate une date en texte relatif pour l'affichage (locale FR).
 * Ex : "il y a 2 heures"
 */
export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "—";
  return format(d, "PPP", { locale: fr });
}
