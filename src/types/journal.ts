// ============================================================
// Types — Journal (Emotions, Mistakes, Tags)
// ============================================================
// Correspond aux tables SQLite : emotions, mistakes, tags,
// et leurs tables de liaison trade_emotions, trade_mistakes, trade_tags.
// ============================================================

// ------------------------------------------------------------
// Emotions
// ------------------------------------------------------------

/** Entité Emotion — table `emotions`. */
export interface Emotion {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

/** Phase du trade à laquelle l'émotion a été ressentie. */
export type EmotionPhase = "before" | "during" | "after";

/**
 * Liaison trade ↔ émotion — table `trade_emotions`.
 * PK composite : (tradeId, emotionId, phase)
 */
export interface TradeEmotion {
  tradeId: number;
  emotionId: number;
  /** Intensité de 1 (faible) à 5 (très forte). */
  intensity: number;
  phase: EmotionPhase;
  createdAt: string;
  // Champs joints (optionnels, présents si SELECT avec JOIN)
  emotionName?: string;
}

// ------------------------------------------------------------
// Mistakes
// ------------------------------------------------------------

/** Entité Mistake — table `mistakes`. */
export interface Mistake {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

/**
 * Liaison trade ↔ erreur — table `trade_mistakes`.
 * PK composite : (tradeId, mistakeId)
 */
export interface TradeMistake {
  tradeId: number;
  mistakeId: number;
  /** Contexte spécifique à ce trade. */
  notes: string | null;
  createdAt: string;
  // Champ joint (optionnel)
  mistakeName?: string;
}

// ------------------------------------------------------------
// Tags
// ------------------------------------------------------------

/** Entité Tag — table `tags`. */
export interface Tag {
  id: number;
  name: string;
  /** Couleur hexadécimale (ex : "#6366f1"). */
  color: string;
  createdAt: string;
}

/**
 * Liaison trade ↔ tag — table `trade_tags`.
 * PK composite : (tradeId, tagId)
 */
export interface TradeTag {
  tradeId: number;
  tagId: number;
  createdAt: string;
  // Champ joint (optionnel)
  tagName?: string;
  tagColor?: string;
}

// ----  Inputs de création -----------------------------------

export interface CreateEmotionInput {
  name: string;
  description?: string | null;
}

export interface CreateMistakeInput {
  name: string;
  description?: string | null;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface AddEmotionToTradeInput {
  tradeId: number;
  emotionId: number;
  intensity?: number;
  phase?: EmotionPhase;
}

export interface AddMistakeToTradeInput {
  tradeId: number;
  mistakeId: number;
  notes?: string | null;
}

/** @deprecated Utiliser les types Emotion/Mistake/Tag ci-dessus. */
export type EmotionType =
  | "confident" | "fearful" | "greedy" | "calm"
  | "frustrated" | "impulsive" | "neutral";
