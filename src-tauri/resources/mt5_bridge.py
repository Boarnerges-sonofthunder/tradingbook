#!/usr/bin/env python3
"""
mt5_bridge.py — Bridge local MetaTrader 5 pour TradingBook
===========================================================
Phase 6 Étapes 2, 3 & 4 — Connexion + Historique + Positions ouvertes

MODES DISPONIBLES :
    --mode check      Vérifier la connexion au terminal MT5 (Étape 2)
    --mode history    Lire l'historique des deals MT5 sur une période (Étape 3)
    --mode positions  Lire les positions actuellement ouvertes (Étape 4)
    --mode positions-stream  Stream des positions a chaque tick detecte
    --mode candles    Lire les chandelles OHLC MT5 (replay)

USAGE :
    python mt5_bridge.py --mode check
    python mt5_bridge.py --mode history --period today
    python mt5_bridge.py --mode history --period 7d
    python mt5_bridge.py --mode history --period 30d
    python mt5_bridge.py --mode history --from 2026-01-01 --to 2026-01-31
    python mt5_bridge.py --mode positions
    python mt5_bridge.py --mode positions-stream --tick-poll-ms 250
    python mt5_bridge.py --mode candles --symbol EURUSD --timeframe M5 --from 2026-01-01 --to 2026-01-07

FORMAT DE SORTIE (stdout JSON, une seule ligne) :
    Mode "check"   → voir check_mt5_connection()
    Mode "history" → voir get_mt5_history()

RÈGLES DE SÉCURITÉ :
    - Lecture seule : ce script ne passe JAMAIS d'ordres.
    - Aucun mot de passe n'est lu ni stocké.
    - mt5.initialize() se connecte au terminal déjà ouvert par l'utilisateur.
    - mt5.shutdown() est toujours appelé (bloc finally).
    - Aucune connexion réseau externe n'est initiée par ce script.

DIFFÉRENCE ENTRE DEAL, ORDER ET POSITION DANS MT5 :
    - Position : un trade ouvert (peut regrouper plusieurs deals).
    - Order     : un ordre passé (peut donner lieu à un ou plusieurs deals).
    - Deal      : une transaction exécutée (entrée, sortie, dividende, swap...).
    Ce bridge travaille au niveau du DEAL — l'unité atomique d'exécution.

CODES D'ERREUR :
    MT5_LIB_MISSING      — bibliothèque Python MetaTrader5 non installée
    MT5_NOT_RUNNING      — terminal MT5 non ouvert ou non accessible
    MT5_NOT_CONNECTED    — MT5 ouvert mais pas connecté au serveur broker
    MT5_NO_DATA          — aucun deal sur la période demandée
    MT5_UNKNOWN_ERROR    — erreur inattendue du terminal
    INVALID_PERIOD       — combinaison from/to invalide ou malformée
    SCRIPT_ERROR         — exception Python non gérée
"""

import json
import sys
import argparse
import datetime
import time

# Force UTF-8 sur stdout/stderr pour éviter les erreurs d'encodage Windows (CP1252)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


# ─── Helpers utilitaires ─────────────────────────────────────────────────────

def build_error(error_code: str, message: str) -> dict:
    """Construit un objet résultat d'erreur standardisé."""
    return {
        "success": False,
        "terminalConnected": False,
        "errorCode": error_code,
        "message": message,
    }


def dt_to_iso(dt: datetime.datetime) -> str:
    """
    Convertit un datetime (avec ou sans timezone) en chaîne ISO 8601 UTC.

    MT5 retourne les timestamps UNIX en UTC. On force l'info de timezone
    UTC sur le datetime pour que les consommateurs TypeScript puissent
    parser correctement avec new Date().
    """
    if dt.tzinfo is None:
        # MT5 fournit des timestamps UTC sans info de timezone — on l'ajoute.
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.isoformat()


def ts_to_iso(ts: int, server_offset_seconds: int = 0) -> str:
    """
    Convertit un timestamp UNIX (entier, secondes) en chaîne ISO 8601 UTC.

    Certains serveurs MT5 exposent les horodatages comme une horloge serveur
    encodée en timestamp. On retire alors l'offset détecté pour stocker l'heure
    UTC réelle dans TradingBook.
    """
    dt = datetime.datetime.fromtimestamp(
        ts - server_offset_seconds,
        tz=datetime.timezone.utc,
    )
    return dt.isoformat()


def detect_server_time_offset_seconds(mt5, symbols: list[str] | None = None) -> int:
    """
    Détecte l'offset entre l'heure serveur MT5 et l'heure UTC réelle.

    Lecture seule : on consulte uniquement les ticks disponibles pour des
    symboles déjà présents dans les positions/deals lus depuis MT5.
    """
    symbols = symbols or []
    unique_symbols = []
    for symbol in symbols:
        if symbol and symbol not in unique_symbols:
            unique_symbols.append(symbol)

    if not unique_symbols:
        try:
            all_symbols = mt5.symbols_get() or []
        except Exception:  # noqa: BLE001
            all_symbols = []

        visible_symbols = []
        fallback_symbols = []
        for symbol_info in all_symbols:
            name = str(getattr(symbol_info, "name", "") or "")
            if not name:
                continue
            if bool(getattr(symbol_info, "visible", False)):
                visible_symbols.append(name)
            else:
                fallback_symbols.append(name)
        unique_symbols = visible_symbols[:20] or fallback_symbols[:20]

    offsets: dict[int, int] = {}
    now_ts = time.time()

    for symbol in unique_symbols[:20]:
        try:
            tick = mt5.symbol_info_tick(symbol)
        except Exception:  # noqa: BLE001
            continue

        tick_ts = int(getattr(tick, "time", 0) or 0) if tick is not None else 0
        if tick_ts <= 0:
            continue

        diff_seconds = tick_ts - now_ts
        rounded_hours = round(diff_seconds / 3600)
        offset_seconds = int(rounded_hours * 3600)

        # On n'accepte qu'un décalage plausible, proche d'une heure entière.
        if abs(rounded_hours) > 14:
            continue
        if abs(diff_seconds - offset_seconds) > 30 * 60:
            continue

        offsets[offset_seconds] = offsets.get(offset_seconds, 0) + 1

    if not offsets:
        return 0

    return max(offsets.items(), key=lambda item: item[1])[0]


# ─── Type de deal MT5 → chaîne lisible ───────────────────────────────────────

# Correspondance des constantes DEAL_TYPE de MetaTrader5.
# Source : https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties
_DEAL_TYPE_NAMES = {
    0: "buy",           # DEAL_TYPE_BUY
    1: "sell",          # DEAL_TYPE_SELL
    2: "balance",       # DEAL_TYPE_BALANCE
    3: "credit",        # DEAL_TYPE_CREDIT
    4: "charge",        # DEAL_TYPE_CHARGE
    5: "correction",    # DEAL_TYPE_CORRECTION
    6: "bonus",         # DEAL_TYPE_BONUS
    7: "commission",    # DEAL_TYPE_COMMISSION
    8: "commission_daily",         # DEAL_TYPE_COMMISSION_DAILY
    9: "commission_monthly",       # DEAL_TYPE_COMMISSION_MONTHLY
    10: "commission_agent_daily",  # DEAL_TYPE_COMMISSION_AGENT_DAILY
    11: "commission_agent_monthly",# DEAL_TYPE_COMMISSION_AGENT_MONTHLY
    12: "interest",     # DEAL_TYPE_INTEREST
    13: "buy_canceled", # DEAL_TYPE_BUY_CANCELED
    14: "sell_canceled",# DEAL_TYPE_SELL_CANCELED
    15: "dividend",     # DEAL_TYPE_DIVIDEND
    16: "dividend_franked",        # DEAL_TYPE_DIVIDEND_FRANKED
    17: "tax",          # DEAL_TYPE_TAX
}

# Constantes DEAL_ENTRY pour comprendre si c'est une entrée/sortie de position.
_DEAL_ENTRY_NAMES = {
    0: "in",     # DEAL_ENTRY_IN  — entrée dans le marché
    1: "out",    # DEAL_ENTRY_OUT — sortie du marché
    2: "inout",  # DEAL_ENTRY_INOUT — retournement de position
    3: "out_by", # DEAL_ENTRY_OUT_BY — clôture par position opposée
}


def deal_type_str(type_int: int) -> str:
    """Convertit un DEAL_TYPE MT5 entier en chaîne lisible."""
    return _DEAL_TYPE_NAMES.get(type_int, f"unknown_{type_int}")


def deal_entry_str(entry_int: int) -> str:
    """Convertit un DEAL_ENTRY MT5 entier en chaîne lisible."""
    return _DEAL_ENTRY_NAMES.get(entry_int, f"unknown_{entry_int}")


# ─── Type de position MT5 → chaîne lisible ────────────────────────────────────

# Constantes POSITION_TYPE de MetaTrader5.
# Source : https://www.mql5.com/en/docs/constants/tradingconstants/positionproperties
_POSITION_TYPE_NAMES = {
    0: "buy",   # POSITION_TYPE_BUY
    1: "sell",  # POSITION_TYPE_SELL
}


def position_type_str(type_int: int) -> str:
    """Convertit un POSITION_TYPE MT5 entier en chaîne lisible."""
    return _POSITION_TYPE_NAMES.get(type_int, f"unknown_{type_int}")


# ─── Mode "check" ─────────────────────────────────────────────────────────────

def check_mt5_connection() -> dict:
    """
    Vérifie la disponibilité du terminal MetaTrader 5.

    1. Tente d'importer la bibliothèque MetaTrader5.
    2. Initialise la connexion au terminal MT5 déjà ouvert.
    3. Récupère les informations du terminal et du compte.
    4. Ferme proprement la connexion.

    Retourne un dictionnaire JSON-serialisable.
    """

    # ── Étape 1 : Vérifier si la bibliothèque est installée ──────────────
    try:
        import MetaTrader5 as mt5  # noqa: N813
    except ImportError:
        return build_error(
            "MT5_LIB_MISSING",
            (
                "La bibliothèque Python MetaTrader5 n'est pas installée. "
                "Exécutez dans un terminal : pip install MetaTrader5"
            ),
        )

    # ── Étape 2 : Initialiser la connexion au terminal MT5 ───────────────
    if not mt5.initialize():
        last_error = mt5.last_error()
        error_detail = f" (code MT5 : {last_error[0]}, {last_error[1]})" if last_error else ""
        return build_error(
            "MT5_NOT_RUNNING",
            (
                f"Impossible de se connecter au terminal MetaTrader 5{error_detail}. "
                "Assurez-vous que MetaTrader 5 est ouvert et connecté à votre compte."
            ),
        )

    # ── Étape 3 : Récupérer les informations disponibles ────────────────
    result = {
        "success": True,
        "terminalConnected": False,
        "message": "MetaTrader 5 détecté avec succès",
    }

    try:
        terminal_info = mt5.terminal_info()
        if terminal_info is not None:
            result["terminalVersion"] = f"MetaTrader 5 build {terminal_info.build}"
            result["terminalPath"] = terminal_info.path
            is_connected = bool(getattr(terminal_info, "connected", False))
            result["terminalConnected"] = is_connected

            if not is_connected:
                result["message"] = (
                    "MetaTrader 5 est ouvert mais n'est pas connecté au serveur broker. "
                    "Vérifiez votre connexion internet."
                )
        else:
            result["terminalConnected"] = True
            result["message"] = (
                "MetaTrader 5 détecté (informations du terminal non disponibles)."
            )

        account_info = mt5.account_info()
        if account_info is not None:
            result["account"] = account_info.login
            result["accountName"] = account_info.name
            result["server"] = account_info.server
            result["company"] = account_info.company
            result["currency"] = account_info.currency
            result["terminalConnected"] = True
            result["message"] = "MetaTrader 5 détecté et connecté avec succès"

    except Exception as exc:  # noqa: BLE001
        result["message"] = f"MT5 détecté mais lecture partielle ({exc})"

    mt5.shutdown()
    return result


# ─── Mode "history" ───────────────────────────────────────────────────────────

def resolve_date_range(period: str | None, from_date: str | None, to_date: str | None):
    """
    Résout la plage de dates demandée en deux datetime UTC.

    Priorité :
      1. --from / --to (plage personnalisée explicite)
      2. --period today | 7d | 30d

    Retourne (from_dt, to_dt, None) en cas de succès,
    ou (None, None, error_dict) en cas d'erreur.
    """
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Plage personnalisée --from / --to ────────────────────────────────
    if from_date is not None or to_date is not None:
        if from_date is None:
            return None, None, build_error(
                "INVALID_PERIOD",
                "L'argument --from est requis quand --to est spécifié.",
            )
        try:
            from_dt = datetime.datetime.fromisoformat(from_date).replace(
                tzinfo=datetime.timezone.utc
            )
        except ValueError:
            return None, None, build_error(
                "INVALID_PERIOD",
                f"Format de date invalide pour --from : '{from_date}'. "
                "Utilisez YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS.",
            )

        if to_date is not None:
            try:
                to_dt = datetime.datetime.fromisoformat(to_date).replace(
                    hour=23, minute=59, second=59,
                    tzinfo=datetime.timezone.utc,
                )
            except ValueError:
                return None, None, build_error(
                    "INVALID_PERIOD",
                    f"Format de date invalide pour --to : '{to_date}'. "
                    "Utilisez YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS.",
                )
        else:
            # --to absent → jusqu'à maintenant
            to_dt = now

        if from_dt >= to_dt:
            return None, None, build_error(
                "INVALID_PERIOD",
                f"La date de début ({from_date}) doit être antérieure à la date de fin.",
            )

        return from_dt, to_dt, None

    # ── Périodes prédéfinies ──────────────────────────────────────────────
    if period is None or period == "today":
        from_dt = today_start
        to_dt = now
    elif period == "7d":
        from_dt = today_start - datetime.timedelta(days=6)
        to_dt = now
    elif period == "30d":
        from_dt = today_start - datetime.timedelta(days=29)
        to_dt = now
    else:
        return None, None, build_error(
            "INVALID_PERIOD",
            f"Période inconnue : '{period}'. "
            "Valeurs acceptées : today, 7d, 30d. "
            "Ou utilisez --from YYYY-MM-DD --to YYYY-MM-DD.",
        )

    return from_dt, to_dt, None


def positive_float(value) -> float:
    """Retourne une valeur positive finie, sinon 0.0."""
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return numeric if numeric > 0 else 0.0


def history_order_time(order) -> int:
    """Retourne le timestamp disponible le plus pertinent pour un ordre historique."""
    for attr in ("time_done", "time_setup", "time_expiration"):
        value = int(getattr(order, attr, 0) or 0)
        if value > 0:
            return value
    return 0


def build_order_level_indexes(orders_raw) -> tuple[dict[int, dict], dict[int, dict]]:
    """
    Indexe les SL/TP des ordres historiques.

    Certains brokers exposent SL/TP sur les ordres historiques, mais pas sur les
    deals. On garde donc un index direct par ticket d'ordre et un fallback par
    positionId avec la derniere valeur positive connue pour chaque niveau.
    """
    order_levels_by_ticket: dict[int, dict] = {}
    latest_levels_by_position: dict[int, dict] = {}

    if not orders_raw:
        return order_levels_by_ticket, latest_levels_by_position

    for order in orders_raw:
        ticket = int(getattr(order, "ticket", 0) or 0)
        position_id = int(getattr(order, "position_id", 0) or 0)
        order_time = history_order_time(order)
        sl = positive_float(getattr(order, "sl", 0.0))
        tp = positive_float(getattr(order, "tp", 0.0))

        if ticket > 0:
            order_levels_by_ticket[ticket] = {"sl": sl, "tp": tp, "time": order_time}

        if position_id <= 0:
            continue

        position_levels = latest_levels_by_position.setdefault(
            position_id,
            {"sl": 0.0, "tp": 0.0, "slTime": -1, "tpTime": -1},
        )
        if sl > 0 and order_time >= position_levels["slTime"]:
            position_levels["sl"] = sl
            position_levels["slTime"] = order_time
        if tp > 0 and order_time >= position_levels["tpTime"]:
            position_levels["tp"] = tp
            position_levels["tpTime"] = order_time

    return order_levels_by_ticket, latest_levels_by_position


def resolve_deal_level(
    deal,
    field: str,
    order_levels_by_ticket: dict[int, dict],
    latest_levels_by_position: dict[int, dict],
) -> float:
    """
    Recupere SL/TP depuis le deal, puis l'ordre lie, puis la position historique.
    """
    raw_value = positive_float(getattr(deal, field, 0.0))
    if raw_value > 0:
        return raw_value

    order_id = int(getattr(deal, "order", 0) or 0)
    order_levels = order_levels_by_ticket.get(order_id)
    if order_levels:
        order_value = positive_float(order_levels.get(field, 0.0))
        if order_value > 0:
            return order_value

    position_id = int(getattr(deal, "position_id", 0) or 0)
    position_levels = latest_levels_by_position.get(position_id)
    if position_levels:
        position_value = positive_float(position_levels.get(field, 0.0))
        if position_value > 0:
            return position_value

    return 0.0


def serialize_deal(
    deal,
    order_levels_by_ticket: dict[int, dict] | None = None,
    latest_levels_by_position: dict[int, dict] | None = None,
    server_offset_seconds: int = 0,
) -> dict:
    """
    Sérialise un deal MT5 (namedtuple) en dictionnaire JSON-compatible.

    CHAMPS RETOURNÉS :
        ticket     — identifiant unique du deal (DEAL_TICKET)
        orderId    — identifiant de l'ordre associé (DEAL_ORDER)
        positionId — identifiant de la position parente (DEAL_POSITION_ID)
        symbol     — instrument financier (DEAL_SYMBOL)
        type       — type lisible : "buy", "sell", "balance", etc.
        typeRaw    — valeur entière MT5 du DEAL_TYPE (pour débogage)
        entry      — sens : "in" (entrée), "out" (sortie), "inout" (retournement)
        entryRaw   — valeur entière MT5 du DEAL_ENTRY (pour débogage)
        volume     — volume du deal en lots (DEAL_VOLUME)
        price      — prix d'exécution (DEAL_PRICE)
        commission — commission du broker (DEAL_COMMISSION, généralement négatif)
        swap       — swap overnight cumulé (DEAL_SWAP)
        profit     — profit/perte brut du deal (DEAL_PROFIT)
        fee        — frais supplémentaires du broker (DEAL_FEE)
        sl         — stop loss au moment du deal (DEAL_SL, 0 si absent)
        tp         — take profit au moment du deal (DEAL_TP, 0 si absent)
        magic      — numéro magique de l'EA qui a passé l'ordre (DEAL_MAGIC)
        comment    — commentaire MT5 du deal (DEAL_COMMENT)
        time       — date/heure d'exécution en ISO 8601 UTC (DEAL_TIME)
    """
    order_levels_by_ticket = order_levels_by_ticket or {}
    latest_levels_by_position = latest_levels_by_position or {}

    return {
        "ticket":     int(deal.ticket),
        "orderId":    int(deal.order),
        "positionId": int(deal.position_id),
        "symbol":     str(deal.symbol),
        "type":       deal_type_str(deal.type),
        "typeRaw":    int(deal.type),
        "entry":      deal_entry_str(deal.entry),
        "entryRaw":   int(deal.entry),
        "volume":     float(deal.volume),
        "price":      float(deal.price),
        "commission": float(deal.commission),
        "swap":       float(deal.swap),
        "profit":     float(deal.profit),
        "fee":        float(getattr(deal, "fee", 0.0)),
        "sl":         resolve_deal_level(deal, "sl", order_levels_by_ticket, latest_levels_by_position),
        "tp":         resolve_deal_level(deal, "tp", order_levels_by_ticket, latest_levels_by_position),
        "magic":      int(getattr(deal, "magic", 0)),
        "comment":    str(deal.comment),
        "time":       ts_to_iso(int(deal.time), server_offset_seconds),
    }


def get_mt5_history(period: str | None, from_date: str | None, to_date: str | None) -> dict:
    """
    Lit l'historique des deals MT5 sur une période donnée.

    LECTURE SEULE — aucun ordre n'est passé, aucune donnée n'est modifiée.

    Retourne un dict JSON avec :
        success     — bool
        range       — { from, to } en ISO 8601 UTC
        deals       — liste des deals sérialisés
        totalDeals  — nombre de deals retournés
        account     — numéro de compte MT5
        accountId   — identifiant string du compte
        server      — serveur broker
        broker      — nom du broker
        currency    — devise du compte
        message     — message descriptif
    """

    # ── Résoudre la plage de dates ────────────────────────────────────────
    from_dt, to_dt, date_error = resolve_date_range(period, from_date, to_date)
    if date_error is not None:
        return date_error

    # ── Importer la bibliothèque MT5 ─────────────────────────────────────
    try:
        import MetaTrader5 as mt5  # noqa: N813
    except ImportError:
        return build_error(
            "MT5_LIB_MISSING",
            "La bibliothèque Python MetaTrader5 n'est pas installée. "
            "Exécutez : pip install MetaTrader5",
        )

    # ── Initialiser la connexion ──────────────────────────────────────────
    if not mt5.initialize():
        last_error = mt5.last_error()
        detail = f" (code : {last_error[0]}, {last_error[1]})" if last_error else ""
        return build_error(
            "MT5_NOT_RUNNING",
            f"Impossible de se connecter au terminal MetaTrader 5{detail}. "
            "Assurez-vous que MetaTrader 5 est ouvert.",
        )

    try:
        # ── Vérifier la connexion au broker ───────────────────────────────
        terminal_info = mt5.terminal_info()
        if terminal_info is not None and not terminal_info.connected:
            return build_error(
                "MT5_NOT_CONNECTED",
                "MetaTrader 5 est ouvert mais pas connecté au serveur broker. "
                "Vérifiez votre connexion internet et réessayez.",
            )

        # ── Informations du compte ─────────────────────────────────────────
        account_info = mt5.account_info()
        account_meta = {}
        if account_info is not None:
            account_meta = {
                "account":   account_info.login,
                "accountId": str(account_info.login),
                "server":    account_info.server,
                "broker":    account_info.company,
                "currency":  account_info.currency,
            }

        # ── Récupérer les deals via l'API MT5 ─────────────────────────────
        #
        # mt5.history_deals_get(from_date, to_date) retourne un tuple de
        # namedtuple ou None si aucun deal / erreur.
        # Les datetimes DOIVENT être sans timezone pour l'API MT5 Python
        # (elle utilise son propre mécanisme de timezone interne).
        server_offset_seconds = detect_server_time_offset_seconds(mt5)
        from_naive = (
            from_dt + datetime.timedelta(seconds=server_offset_seconds)
        ).replace(tzinfo=None)
        to_naive = (
            to_dt + datetime.timedelta(seconds=server_offset_seconds)
        ).replace(tzinfo=None)

        deals_raw = mt5.history_deals_get(from_naive, to_naive)

        if deals_raw is None:
            # Vérifier s'il y a une erreur MT5 ou simplement aucune donnée
            last_error = mt5.last_error()
            if last_error and last_error[0] != 0:
                return build_error(
                    "MT5_UNKNOWN_ERROR",
                    f"Erreur MT5 lors de la lecture de l'historique "
                    f"(code {last_error[0]}) : {last_error[1]}",
                )
            # Pas d'erreur = aucun deal sur la période
            return {
                "success":    True,
                "range":      {"from": dt_to_iso(from_dt), "to": dt_to_iso(to_dt)},
                "deals":      [],
                "totalDeals": 0,
                "message":    "Aucun deal trouvé sur la période sélectionnée.",
                **account_meta,
            }

        # ── Sérialiser les deals ───────────────────────────────────────────
        # Enrichissement SL/TP via les ordres historiques (lecture seule).
        orders_raw = mt5.history_orders_get(from_naive, to_naive)
        if orders_raw is None:
            last_error = mt5.last_error()
            if last_error and last_error[0] != 0:
                sys.stderr.write(
                    "[mt5_bridge] Avertissement : impossible de lire les "
                    f"ordres historiques pour enrichir SL/TP "
                    f"(code {last_error[0]}) : {last_error[1]}\n"
                )
            orders_raw = []

        order_levels_by_ticket, latest_levels_by_position = build_order_level_indexes(orders_raw)

        symbols_for_time_offset = [
            str(getattr(deal, "symbol", "")) for deal in deals_raw
        ]
        symbol_offset_seconds = detect_server_time_offset_seconds(
            mt5,
            symbols_for_time_offset,
        )
        if symbol_offset_seconds != 0:
            server_offset_seconds = symbol_offset_seconds

        deals_list = []
        for deal in deals_raw:
            try:
                deals_list.append(
                    serialize_deal(
                        deal,
                        order_levels_by_ticket,
                        latest_levels_by_position,
                        server_offset_seconds,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                # Un deal malformé ne doit pas bloquer tous les autres
                sys.stderr.write(
                    f"[mt5_bridge] Avertissement : impossible de sérialiser "
                    f"le deal ticket={getattr(deal, 'ticket', '?')} : {exc}\n"
                )

        return {
            "success":    True,
            "range":      {"from": dt_to_iso(from_dt), "to": dt_to_iso(to_dt)},
            "deals":      deals_list,
            "totalDeals": len(deals_list),
            "serverTimeOffsetSeconds": server_offset_seconds,
            "message":    (
                f"{len(deals_list)} deal(s) récupéré(s) sur la période "
                f"{from_dt.strftime('%d/%m/%Y')} → {to_dt.strftime('%d/%m/%Y')}."
            ),
            **account_meta,
        }

    except Exception as exc:  # noqa: BLE001
        return build_error(
            "SCRIPT_ERROR",
            f"Erreur inattendue lors de la lecture de l'historique MT5 : {exc}",
        )

    finally:
        # TOUJOURS fermer la connexion, même en cas d'erreur
        mt5.shutdown()


# ─── Mode "positions" ────────────────────────────────────────────────────────

def serialize_position(pos, server_offset_seconds: int = 0) -> dict:
    """
    Sérialise une position MT5 ouverte (namedtuple) en dictionnaire JSON.

    CHAMPS RETOURNÉS :
        ticket       — ticket unique de la position (POSITION_TICKET)
        positionId   — identifiant de position (POSITION_IDENTIFIER, = ticket)
        symbol       — instrument financier (POSITION_SYMBOL)
        type         — type lisible : "buy" ou "sell" (POSITION_TYPE)
        typeRaw      — valeur entière MT5 du POSITION_TYPE (pour débogage)
        volume       — volume de la position en lots (POSITION_VOLUME)
        openPrice    — prix d'ouverture de la position (POSITION_PRICE_OPEN)
        currentPrice — prix actuel du marché (POSITION_PRICE_CURRENT)
        stopLoss     — stop loss (0.0 si non défini) (POSITION_SL)
        takeProfit   — take profit (0.0 si non défini) (POSITION_TP)
        profit       — P&L non réalisé en devise du compte (POSITION_PROFIT)
        swap         — swap cumulé depuis l'ouverture (POSITION_SWAP)
        commission   — commission initiale (POSITION_COMMISSION, souvent 0)
        openTime     — heure d'ouverture en ISO 8601 UTC (POSITION_TIME)
        comment      — commentaire MT5 de la position (POSITION_COMMENT)
        magic        — numéro magique de l'EA créateur (POSITION_MAGIC)

    NOTE : `commission` dans positions_get() représente la commission initiale
    d'ouverture uniquement. La commission de clôture sera ajoutée à la fermeture.
    """
    return {
        "ticket":       int(pos.ticket),
        "positionId":   int(pos.identifier),
        "symbol":       str(pos.symbol),
        "type":         position_type_str(pos.type),
        "typeRaw":      int(pos.type),
        "volume":       float(pos.volume),
        "openPrice":    float(pos.price_open),
        "currentPrice": float(pos.price_current),
        "stopLoss":     float(pos.sl),
        "takeProfit":   float(pos.tp),
        "profit":       float(pos.profit),
        "swap":         float(pos.swap),
        # commission n'est pas toujours disponible dans positions_get() selon le broker
        "commission":   float(getattr(pos, "commission", 0.0)),
        "openTime":     ts_to_iso(int(pos.time), server_offset_seconds),
        "comment":      str(pos.comment),
        "magic":        int(getattr(pos, "magic", 0)),
    }


def get_mt5_positions() -> dict:
    """
    Lit les positions actuellement ouvertes dans MetaTrader 5.

    LECTURE SEULE — aucun ordre n'est passé, aucune position n'est modifiée.

    Retourne un dict JSON avec :
        success        — bool
        positions      — liste des positions sérialisées
        totalPositions — nombre de positions ouvertes
        account        — numéro de compte MT5
        accountId      — identifiant string du compte
        server         — serveur broker
        broker         — nom du broker
        currency       — devise du compte
        message        — message descriptif
    """

    # ── Importer la bibliothèque MT5 ─────────────────────────────────────
    try:
        import MetaTrader5 as mt5  # noqa: N813
    except ImportError:
        return {
            "success":        False,
            "positions":      [],
            "totalPositions": 0,
            "errorCode":      "MT5_LIB_MISSING",
            "message":        (
                "La bibliothèque Python MetaTrader5 n'est pas installée. "
                "Exécutez : pip install MetaTrader5"
            ),
        }

    # ── Initialiser la connexion ──────────────────────────────────────────
    if not mt5.initialize():
        last_error = mt5.last_error()
        detail = f" (code : {last_error[0]}, {last_error[1]})" if last_error else ""
        return {
            "success":        False,
            "positions":      [],
            "totalPositions": 0,
            "errorCode":      "MT5_NOT_RUNNING",
            "message":        (
                f"Impossible de se connecter au terminal MetaTrader 5{detail}. "
                "Assurez-vous que MetaTrader 5 est ouvert."
            ),
        }

    try:
        # ── Vérifier la connexion au broker ───────────────────────────────
        terminal_info = mt5.terminal_info()
        if terminal_info is not None and not terminal_info.connected:
            return {
                "success":        False,
                "positions":      [],
                "totalPositions": 0,
                "errorCode":      "MT5_NOT_CONNECTED",
                "message":        (
                    "MetaTrader 5 est ouvert mais pas connecté au serveur broker. "
                    "Vérifiez votre connexion internet et réessayez."
                ),
            }

        # ── Informations du compte ─────────────────────────────────────────
        account_info = mt5.account_info()
        account_meta = {}
        if account_info is not None:
            account_meta = {
                "account":   account_info.login,
                "accountId": str(account_info.login),
                "server":    account_info.server,
                "broker":    account_info.company,
                "currency":  account_info.currency,
            }

        # ── Récupérer les positions ouvertes ──────────────────────────────
        #
        # mt5.positions_get() retourne un tuple de namedtuple ou None.
        # None signifie soit aucune position, soit une erreur MT5.
        # On distingue les deux cas via mt5.last_error().
        positions_raw = mt5.positions_get()

        if positions_raw is None:
            last_error = mt5.last_error()
            if last_error and last_error[0] != 0:
                return {
                    "success":        False,
                    "positions":      [],
                    "totalPositions": 0,
                    "errorCode":      "MT5_UNKNOWN_ERROR",
                    "message":        (
                        f"Erreur MT5 lors de la lecture des positions "
                        f"(code {last_error[0]}) : {last_error[1]}"
                    ),
                    **account_meta,
                }
            # Aucune erreur = compte sans position ouverte (normal)
            return {
                "success":        True,
                "positions":      [],
                "totalPositions": 0,
                "message":        "Aucune position ouverte sur ce compte.",
                **account_meta,
            }

        # ── Sérialiser les positions ───────────────────────────────────────
        symbols_for_time_offset = [
            str(getattr(pos, "symbol", "")) for pos in positions_raw
        ]
        server_offset_seconds = detect_server_time_offset_seconds(
            mt5,
            symbols_for_time_offset,
        )

        positions_list = []
        for pos in positions_raw:
            try:
                positions_list.append(serialize_position(pos, server_offset_seconds))
            except Exception as exc:  # noqa: BLE001
                sys.stderr.write(
                    f"[mt5_bridge] Avertissement : impossible de sérialiser "
                    f"la position ticket={getattr(pos, 'ticket', '?')} : {exc}\n"
                )

        count = len(positions_list)
        return {
            "success":        True,
            "positions":      positions_list,
            "totalPositions": count,
            "serverTimeOffsetSeconds": server_offset_seconds,
            "message":        (
                f"{count} position(s) ouverte(s) sur le compte."
                if count > 0
                else "Aucune position ouverte sur ce compte."
            ),
            **account_meta,
        }

    except Exception as exc:  # noqa: BLE001
        return {
            "success":        False,
            "positions":      [],
            "totalPositions": 0,
            "errorCode":      "SCRIPT_ERROR",
            "message":        (
                f"Erreur inattendue lors de la lecture des positions MT5 : {exc}"
            ),
        }

    finally:
        # TOUJOURS fermer la connexion, même en cas d'erreur
        mt5.shutdown()


def build_positions_snapshot_payload(
    mt5,
    positions_raw,
    account_meta: dict,
) -> tuple[dict, str]:
    """
    Construit payload JSON d'un snapshot positions + signature stable.

    Signature sert a eviter emission en boucle sans changement utile.
    """
    symbols_for_time_offset = [
        str(getattr(pos, "symbol", "")) for pos in positions_raw
    ]
    server_offset_seconds = detect_server_time_offset_seconds(
        mt5,
        symbols_for_time_offset,
    )

    positions_list = []
    for pos in positions_raw:
        try:
            positions_list.append(serialize_position(pos, server_offset_seconds))
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(
                f"[mt5_bridge] Avertissement : impossible de sérialiser "
                f"la position ticket={getattr(pos, 'ticket', '?')} : {exc}\n"
            )

    count = len(positions_list)
    payload = {
        "success": True,
        "positions": positions_list,
        "totalPositions": count,
        "serverTimeOffsetSeconds": server_offset_seconds,
        "message": (
            f"{count} position(s) ouverte(s) sur le compte."
            if count > 0
            else "Aucune position ouverte sur ce compte."
        ),
        **account_meta,
    }

    signature_parts = [
        (
            f"{item['ticket']}:{item['currentPrice']}:{item['profit']}:"
            f"{item['swap']}:{item['volume']}"
        )
        for item in positions_list
    ]
    signature = "|".join(sorted(signature_parts))
    return payload, signature


def get_mt5_positions_stream(tick_poll_ms: int = 250) -> int:
    """
    Stream NDJSON des positions ouvertes.

    Emission initiale immediate (snapshot), puis emission uniquement quand
    tick change sur un symbole ouvert ou quand set de positions change.

    Retour:
        0 si arret normal, 1 si erreur critique de demarrage.
    """

    def emit(payload: dict) -> None:
        print(json.dumps(payload, ensure_ascii=False), flush=True)

    try:
        import MetaTrader5 as mt5  # noqa: N813
    except ImportError:
        emit(
            {
                "success": False,
                "positions": [],
                "totalPositions": 0,
                "errorCode": "MT5_LIB_MISSING",
                "message": (
                    "La bibliothèque Python MetaTrader5 n'est pas installée. "
                    "Exécutez : pip install MetaTrader5"
                ),
                "streamEvent": "error",
            }
        )
        return 1

    if not mt5.initialize():
        last_error = mt5.last_error()
        detail = f" (code : {last_error[0]}, {last_error[1]})" if last_error else ""
        emit(
            {
                "success": False,
                "positions": [],
                "totalPositions": 0,
                "errorCode": "MT5_NOT_RUNNING",
                "message": (
                    f"Impossible de se connecter au terminal MetaTrader 5{detail}. "
                    "Assurez-vous que MetaTrader 5 est ouvert."
                ),
                "streamEvent": "error",
            }
        )
        return 1

    poll_seconds = max(0.05, min(float(tick_poll_ms) / 1000.0, 2.0))

    try:
        account_info = mt5.account_info()
        account_meta = {}
        if account_info is not None:
            account_meta = {
                "account": account_info.login,
                "accountId": str(account_info.login),
                "server": account_info.server,
                "broker": account_info.company,
                "currency": account_info.currency,
            }

        # Snapshot initial pour initialiser UI immediatement.
        positions_raw = mt5.positions_get()
        if positions_raw is None:
            positions_raw = []

        payload, last_positions_signature = build_positions_snapshot_payload(
            mt5,
            positions_raw,
            account_meta,
        )
        payload["streamEvent"] = "snapshot"
        emit(payload)

        last_tick_signatures: dict[str, tuple[int, float, float]] = {}
        last_connectivity_error = False

        while True:
            terminal_info = mt5.terminal_info()
            connected = terminal_info is None or bool(
                getattr(terminal_info, "connected", False)
            )

            if not connected:
                if not last_connectivity_error:
                    emit(
                        {
                            "success": False,
                            "positions": [],
                            "totalPositions": 0,
                            "errorCode": "MT5_NOT_CONNECTED",
                            "message": (
                                "MetaTrader 5 est ouvert mais pas connecté au serveur broker. "
                                "Vérifiez votre connexion internet et réessayez."
                            ),
                            "streamEvent": "error",
                            **account_meta,
                        }
                    )
                    last_connectivity_error = True
                time.sleep(poll_seconds)
                continue

            positions_raw = mt5.positions_get()
            if positions_raw is None:
                positions_raw = []

            symbols = sorted(
                {
                    str(getattr(pos, "symbol", ""))
                    for pos in positions_raw
                    if str(getattr(pos, "symbol", ""))
                }
            )

            tick_changed = False
            for symbol in symbols:
                tick = mt5.symbol_info_tick(symbol)
                if tick is None:
                    continue
                signature = (
                    int(getattr(tick, "time_msc", 0) or 0),
                    float(getattr(tick, "bid", 0.0) or 0.0),
                    float(getattr(tick, "ask", 0.0) or 0.0),
                )
                previous = last_tick_signatures.get(symbol)
                last_tick_signatures[symbol] = signature
                if previous != signature:
                    tick_changed = True

            payload, current_positions_signature = build_positions_snapshot_payload(
                mt5,
                positions_raw,
                account_meta,
            )

            if tick_changed or current_positions_signature != last_positions_signature:
                payload["streamEvent"] = "tick" if tick_changed else "positions-change"
                emit(payload)
                last_positions_signature = current_positions_signature
                last_connectivity_error = False

            time.sleep(poll_seconds)

    except KeyboardInterrupt:
        return 0
    except Exception as exc:  # noqa: BLE001
        emit(
            {
                "success": False,
                "positions": [],
                "totalPositions": 0,
                "errorCode": "SCRIPT_ERROR",
                "message": (
                    f"Erreur inattendue lors du stream des positions MT5 : {exc}"
                ),
                "streamEvent": "error",
            }
        )
        return 1
    finally:
        mt5.shutdown()


# ─── Mode "candles" ─────────────────────────────────────────────────────────

_TIMEFRAME_MAP = {
    "M1": "TIMEFRAME_M1",
    "M5": "TIMEFRAME_M5",
    "M15": "TIMEFRAME_M15",
    "M30": "TIMEFRAME_M30",
    "H1": "TIMEFRAME_H1",
    "H4": "TIMEFRAME_H4",
    "D1": "TIMEFRAME_D1",
}


def parse_iso_datetime(value: str | None, end_of_day: bool = False):
    """Parse une date ISO simple (YYYY-MM-DD ou datetime ISO)."""
    if value is None:
        return None
    try:
        dt = datetime.datetime.fromisoformat(value)
    except ValueError:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)

    if end_of_day and "T" not in value:
        dt = dt.replace(hour=23, minute=59, second=59, microsecond=0)

    return dt


def serialize_candle(rate, server_offset_seconds: int = 0) -> dict:
    """Sérialise une bougie MT5 copy_rates_range vers JSON standard."""
    ts = int(rate["time"])
    tick_volume = float(rate["tick_volume"]) if "tick_volume" in rate.dtype.names else 0.0
    return {
        "time": ts_to_iso(ts, server_offset_seconds),
        "open": float(rate["open"]),
        "high": float(rate["high"]),
        "low": float(rate["low"]),
        "close": float(rate["close"]),
        "volume": tick_volume,
    }


def get_mt5_candles(
    symbol: str | None,
    timeframe: str | None,
    from_date: str | None,
    to_date: str | None,
    max_bars: int | None,
) -> dict:
    """
    Lit chandelles OHLC MT5 sur plage temporelle.
    Lecture seule. Aucune execution ordre.
    """
    if symbol is None or not str(symbol).strip():
        return {
            "success": False,
            "candles": [],
            "totalCandles": 0,
            "errorCode": "INVALID_PERIOD",
            "message": "Le paramètre --symbol est requis pour --mode candles.",
        }

    symbol = str(symbol).strip().upper()
    timeframe = (timeframe or "M5").upper()

    if timeframe not in _TIMEFRAME_MAP:
        return {
            "success": False,
            "candles": [],
            "totalCandles": 0,
            "errorCode": "INVALID_PERIOD",
            "message": f"Timeframe invalide: {timeframe}. Valeurs: {', '.join(_TIMEFRAME_MAP.keys())}.",
        }

    from_dt = parse_iso_datetime(from_date)
    to_dt = parse_iso_datetime(to_date, end_of_day=True)

    if from_dt is None or to_dt is None:
        return {
            "success": False,
            "candles": [],
            "totalCandles": 0,
            "errorCode": "INVALID_PERIOD",
            "message": "Les paramètres --from et --to doivent être fournis en format ISO valide.",
        }

    if from_dt >= to_dt:
        return {
            "success": False,
            "candles": [],
            "totalCandles": 0,
            "errorCode": "INVALID_PERIOD",
            "message": "La date --from doit être antérieure à --to.",
        }

    bars_limit = min(max(int(max_bars or 2000), 100), 20000)

    try:
        import MetaTrader5 as mt5  # noqa: N813
    except ImportError:
        return {
            "success": False,
            "candles": [],
            "totalCandles": 0,
            "errorCode": "MT5_LIB_MISSING",
            "message": "La bibliothèque Python MetaTrader5 n'est pas installée.",
        }

    if not mt5.initialize():
        last_error = mt5.last_error()
        detail = f" (code : {last_error[0]}, {last_error[1]})" if last_error else ""
        return {
            "success": False,
            "candles": [],
            "totalCandles": 0,
            "errorCode": "MT5_NOT_RUNNING",
            "message": f"Impossible de se connecter au terminal MT5{detail}.",
        }

    try:
        terminal_info = mt5.terminal_info()
        if terminal_info is not None and not terminal_info.connected:
            return {
                "success": False,
                "candles": [],
                "totalCandles": 0,
                "errorCode": "MT5_NOT_CONNECTED",
                "message": "MetaTrader 5 est ouvert mais pas connecté au broker.",
            }

        account_info = mt5.account_info()
        account_meta = {}
        if account_info is not None:
            account_meta = {
                "account": account_info.login,
                "accountId": str(account_info.login),
                "server": account_info.server,
                "broker": account_info.company,
                "currency": account_info.currency,
            }

        tf_constant = getattr(mt5, _TIMEFRAME_MAP[timeframe], None)
        if tf_constant is None:
            return {
                "success": False,
                "candles": [],
                "totalCandles": 0,
                "errorCode": "SCRIPT_ERROR",
                "message": f"Constante MT5 introuvable pour timeframe {timeframe}.",
                **account_meta,
            }

        if mt5.symbol_info(symbol) is None:
            return {
                "success": False,
                "candles": [],
                "totalCandles": 0,
                "errorCode": "MT5_NO_DATA",
                "message": f"Symbole introuvable dans MT5: {symbol}.",
                **account_meta,
            }

        rates = mt5.copy_rates_range(
            symbol,
            tf_constant,
            from_dt.astimezone(datetime.timezone.utc).replace(tzinfo=None),
            to_dt.astimezone(datetime.timezone.utc).replace(tzinfo=None),
        )

        if rates is None:
            last_error = mt5.last_error()
            if last_error and last_error[0] != 0:
                return {
                    "success": False,
                    "candles": [],
                    "totalCandles": 0,
                    "errorCode": "MT5_UNKNOWN_ERROR",
                    "message": f"Erreur MT5 copy_rates_range (code {last_error[0]}): {last_error[1]}",
                    **account_meta,
                }
            rates = []

        offset_seconds = detect_server_time_offset_seconds(mt5, [symbol])

        candles = [
            serialize_candle(rate, offset_seconds)
            for rate in rates[-bars_limit:]
        ]

        return {
            "success": True,
            "symbol": symbol,
            "timeframe": timeframe,
            "range": {"from": dt_to_iso(from_dt), "to": dt_to_iso(to_dt)},
            "candles": candles,
            "totalCandles": len(candles),
            "message": f"{len(candles)} bougie(s) OHLC récupérée(s).",
            **account_meta,
        }

    except Exception as exc:  # noqa: BLE001
        return {
            "success": False,
            "candles": [],
            "totalCandles": 0,
            "errorCode": "SCRIPT_ERROR",
            "message": f"Erreur inattendue lecture candles MT5 : {exc}",
        }

    finally:
        mt5.shutdown()


# ─── Point d'entrée principal ─────────────────────────────────────────────────

def main() -> None:
    """Point d'entrée principal du bridge."""
    parser = argparse.ArgumentParser(
        description="TradingBook MT5 Bridge — lecture seule",
        add_help=False,
    )
    parser.add_argument(
        "--mode",
        default="check",
        choices=["check", "history", "positions", "positions-stream", "candles"],
        help="Mode : 'check', 'history', 'positions', 'positions-stream' ou 'candles'",
    )
    parser.add_argument(
        "--period",
        default=None,
        choices=["today", "7d", "30d"],
        help="Période prédéfinie pour --mode history",
    )
    parser.add_argument(
        "--from",
        dest="from_date",
        default=None,
        metavar="YYYY-MM-DD",
        help="Début de plage personnalisée (--mode history)",
    )
    parser.add_argument(
        "--to",
        dest="to_date",
        default=None,
        metavar="YYYY-MM-DD",
        help="Fin de plage personnalisée (--mode history)",
    )
    parser.add_argument(
        "--symbol",
        default=None,
        help="Symbole MT5 (requis pour --mode candles)",
    )
    parser.add_argument(
        "--timeframe",
        default="M5",
        help="Timeframe OHLC pour --mode candles (M1/M5/M15/M30/H1/H4/D1)",
    )
    parser.add_argument(
        "--max-bars",
        dest="max_bars",
        default=2000,
        type=int,
        help="Nombre max de bougies retournees en --mode candles",
    )
    parser.add_argument(
        "--tick-poll-ms",
        dest="tick_poll_ms",
        default=250,
        type=int,
        help="Frequence de polling tick en millisecondes pour --mode positions-stream",
    )

    try:
        args, _ = parser.parse_known_args()
    except SystemExit:
        args = argparse.Namespace(
            mode="check",
            period=None,
            from_date=None,
            to_date=None,
            symbol=None,
            timeframe="M5",
            max_bars=2000,
            tick_poll_ms=250,
        )

    # ── Dispatch selon le mode ────────────────────────────────────────────
    if args.mode == "check":
        result = check_mt5_connection()
    elif args.mode == "history":
        result = get_mt5_history(
            period=args.period,
            from_date=args.from_date,
            to_date=args.to_date,
        )
    elif args.mode == "positions":
        result = get_mt5_positions()
    elif args.mode == "positions-stream":
        exit_code = get_mt5_positions_stream(args.tick_poll_ms)
        sys.exit(exit_code)
    elif args.mode == "candles":
        result = get_mt5_candles(
            symbol=args.symbol,
            timeframe=args.timeframe,
            from_date=args.from_date,
            to_date=args.to_date,
            max_bars=args.max_bars,
        )
    else:
        result = build_error("SCRIPT_ERROR", f"Mode inconnu : {args.mode}")

    # Sortie JSON vers stdout (lue par TypeScript)
    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        # Dernier filet de sécurité — ne doit jamais arriver
        error = build_error(
            "SCRIPT_ERROR",
            f"Erreur inattendue dans le bridge MT5 : {exc}",
        )
        print(json.dumps(error, ensure_ascii=False))
        sys.exit(1)
