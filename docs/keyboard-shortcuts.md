# Raccourcis clavier — TradingBook

> **Source de vérité** : [`src/constants/shortcuts.ts`](../src/constants/shortcuts.ts)
> Toute modification doit être faite dans ce fichier, puis répercutée ici.

---

## Navigation

| Touche     | Action             | Identifiant      |
| ---------- | ------------------ | ---------------- |
| `Alt + 1`  | Tableau de bord    | `NAV_DASHBOARD`  |
| `Alt + 2`  | Journal des trades | `NAV_TRADES`     |
| `Alt + 3`  | Analytics          | `NAV_ANALYTICS`  |
| `Alt + 4`  | Calendrier         | `NAV_CALENDAR`   |
| `Alt + 5`  | Stratégies         | `NAV_STRATEGIES` |
| `Ctrl + ,` | Paramètres         | `NAV_SETTINGS`   |

---

## Trades

| Touche     | Action                 | Identifiant |
| ---------- | ---------------------- | ----------- |
| `Ctrl + N` | Créer un nouveau trade | `TRADE_NEW` |

---

## Données

| Touche     | Action                  | Identifiant     |
| ---------- | ----------------------- | --------------- |
| `Ctrl + I` | Importer un fichier CSV | `DATA_IMPORT`   |
| `Ctrl + B` | Créer un backup manuel  | `DATA_BACKUP`   |
| `Ctrl + R` | Synchronisation MT5     | `DATA_MT5_SYNC` |

---

## Global

| Touche     | Action                     | Identifiant   | État                         |
| ---------- | -------------------------- | ------------- | ---------------------------- |
| `Échap`    | Fermer la modale / annuler | `CLOSE_MODAL` | ✅ Actif                     |
| `Ctrl + F` | Recherche globale          | `OPEN_SEARCH` | 🔜 En attente de `SearchBar` |

---

## Règles de comportement

- Les raccourcis **ne se déclenchent pas** si le curseur est dans un champ de saisie (`<input>`, `<textarea>`, etc.).
- **Exception** : `Échap` se déclenche toujours (fermeture de modale).
- `event.preventDefault()` est appelé automatiquement pour bloquer les comportements par défaut du navigateur (ex : `Ctrl+S` → enregistrer la page).

---

## Ajouter un nouveau raccourci

1. **Déclarer l'identifiant** dans [`src/types/shortcut.ts`](../src/types/shortcut.ts) → union `ShortcutAction` :

   ```ts
   | "MON_ACTION"
   ```

2. **Ajouter la définition** dans [`src/constants/shortcuts.ts`](../src/constants/shortcuts.ts) :

   ```ts
   {
     action: "MON_ACTION",
     key: { key: "k", ctrl: true },
     label: "Mon action",
     description: "Description affichée dans l'aide",
     group: "global",
     enabled: true,
   }
   ```

3. **Passer le handler** dans le composant concerné :

   ```tsx
   import { useKeyboardShortcuts } from "../hooks";

   useKeyboardShortcuts({
     MON_ACTION: () => faireQuelqueChose(),
   });
   ```

4. **Mettre à jour ce fichier** avec la nouvelle ligne dans le tableau correspondant.

---

## État global des raccourcis

| Symbole    | Signification                                                      |
| ---------- | ------------------------------------------------------------------ |
| ✅ Actif   | Déclaré, `enabled: true`, handler implémenté                       |
| ⚙️ Déclaré | Déclaré, `enabled: true`, handler à implémenter dans la page cible |
| 🔜 Préparé | Déclaré, `enabled: false`, fonctionnalité future                   |

| Raccourci                  | État       |
| -------------------------- | ---------- |
| `Alt + 1–5` (navigation)   | ⚙️ Déclaré |
| `Ctrl + ,` (paramètres)    | ⚙️ Déclaré |
| `Ctrl + N` (nouveau trade) | ⚙️ Déclaré |
| `Ctrl + I` (import)        | ⚙️ Déclaré |
| `Ctrl + B` (backup)        | ⚙️ Déclaré |
| `Ctrl + R` (MT5 sync)      | ⚙️ Déclaré |
| `Échap` (fermer modale)    | ⚙️ Déclaré |
| `Ctrl + F` (recherche)     | 🔜 Préparé |
