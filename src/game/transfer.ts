/**
 * QR game transfer — offline handover between two devices.
 *
 * A transfer is a *snapshot*, never a sync. The sending phone encodes the whole
 * {@link GameState}, the receiving phone decodes and validates it, and the
 * sending phone is only locked once a human confirms the handover code.
 *
 * Encoding pipeline (one format for both devices, no second schema to keep in
 * sync with the game engine):
 *
 *   GameState → JSON → LZString (URI-safe) → one QR, or N labelled parts
 *
 * Every QR carries its part number, the total part count, the transfer id and a
 * checksum of the whole payload, so missing, duplicated, corrupted or foreign
 * parts are always detected. Nothing is ever truncated: if a game cannot fit in
 * {@link MAX_PARTS} codes the caller is told to use the file export instead.
 *
 * Validation on import reuses the persistence layer's field-by-field parser, so
 * imported games obey exactly the same rules as saved ones.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { MAX_PLAYERS, MIN_PLAYERS } from './validation'
import { parseGameState } from './persistence'
import { PackedGameError, packGame, unpackGame } from './transferCodec'
import type { GameState } from './types'

export const TRANSFER_VERSION = 1
export const TRANSFER_FILE_FORMAT = 'uno-night-transfer'

/** Prefix of every QR payload / part. */
const QR_PREFIX = 'U1'
/** Practical ceiling for one QR code: comfortable to scan off a phone screen. */
export const QR_CHAR_LIMIT = 1100
/** Hard stop: beyond this the file export is the sane option. */
export const MAX_PARTS = 24
/** Guard against a hostile payload expanding in memory. */
const MAX_ENCODED_CHARS = 400_000

export type TransferPart = {
  /** 1-based part number. */
  index: number
  total: number
  id: string
  hash: string
  chunk: string
}

export type TransferPlan =
  | { mode: 'single'; parts: string[]; total: 1 }
  | { mode: 'multi'; parts: string[]; total: number }
  | { mode: 'too-large'; total: number; reason: string }

export type DecodeResult =
  | { ok: true; game: GameState; id: string; createdAt: number; payload: string }
  | { ok: false; error: string }

/* ------------------------------------------------------------------ hashing */

/** FNV-1a 32-bit, hex encoded. Used for payload integrity, not security. */
export function hashOf(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Ambiguous characters (0/O/1/I) are removed so codes can be read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Six-character handover code derived from the transfer id. */
export function handoverCode(id: string): string {
  let hash = 0x811c9dc5
  const seed = `${id}:uno-night-handover`
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  let value = hash >>> 0
  let code = ''
  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[value % CODE_ALPHABET.length]
    value = Math.floor(value / CODE_ALPHABET.length + (index + 1) * 7)
  }
  return code
}

/** Normalises user-typed handover codes (spaces, dashes, lower case). */
export function normalizeHandoverCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

/* ----------------------------------------------------------------- encoding */

export interface TransferEnvelope {
  /** Format version of the envelope itself. */
  v: number
  /** Transfer id shared by both devices. */
  id: string
  /** When the snapshot was taken. */
  at: number
  /** Compact projection of the game (see transferCodec). */
  g: unknown
}

/**
 * Serialises a game for transfer. The local transfer bookkeeping is stripped so
 * the receiving device always starts editable.
 */
export function encodeTransfer(game: GameState, options: { at?: number } = {}): DecodeResult {
  if (!game.config || game.phase === 'idle') {
    return { ok: false, error: 'There is no game to transfer yet.' }
  }
  const id = game.transfer?.id
  if (!id) return { ok: false, error: 'Start the transfer from the game menu first.' }

  const snapshot: GameState = { ...game, transfer: null }
  const createdAt = options.at ?? Date.now()
  let payload: string
  try {
    const envelope: TransferEnvelope = {
      v: TRANSFER_VERSION,
      id,
      at: createdAt,
      g: packGame(snapshot),
    }
    payload = compressToEncodedURIComponent(JSON.stringify(envelope))
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : ''
    return { ok: false, error: `The game could not be prepared for transfer${detail}.` }
  }
  return { ok: true, game: snapshot, id, createdAt, payload }
}

/** Validates a decoded payload — version, envelope and every game field. */
export function decodeTransfer(rawPayload: string): DecodeResult {
  const payload = rawPayload.trim()
  if (payload.length === 0) return { ok: false, error: 'The transfer data is empty.' }
  if (payload.length > MAX_ENCODED_CHARS) {
    return { ok: false, error: 'That transfer is far too large to be a real game.' }
  }

  let json: string | null
  try {
    json = decompressFromEncodedURIComponent(payload)
  } catch {
    return { ok: false, error: 'The transfer data is damaged and cannot be read.' }
  }
  if (!json) {
    return {
      ok: false,
      error: 'This is not a UNO Night transfer (or part of one is missing).',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'The transfer data is damaged and cannot be read.' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'The transfer data does not contain a game.' }
  }
  const envelope = parsed as Record<string, unknown>

  if (envelope.v !== TRANSFER_VERSION) {
    return {
      ok: false,
      error: 'This transfer came from a different version of the app and cannot be opened.',
    }
  }
  if (typeof envelope.id !== 'string' || envelope.id.trim().length < 4 || envelope.id.length > 64) {
    return { ok: false, error: 'The transfer is missing its handover id.' }
  }
  if (typeof envelope.at !== 'number' || !Number.isFinite(envelope.at)) {
    return { ok: false, error: 'The transfer is missing its timestamp.' }
  }

  let expanded: unknown
  try {
    expanded = unpackGame(envelope.g)
  } catch (error) {
    const detail = error instanceof PackedGameError ? error.message : 'unknown problem'
    return { ok: false, error: `The transfer is damaged: ${detail}.` }
  }

  let game: GameState
  try {
    game = parseGameState(expanded)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown problem'
    return { ok: false, error: `The transferred game failed validation: ${detail}.` }
  }

  // The receiver is the new controller: never inherit a lock or stale bookkeeping.
  const received: GameState = { ...game, transfer: null }
  if (received.players.length < MIN_PLAYERS || received.players.length > MAX_PLAYERS) {
    return { ok: false, error: 'The transferred game has the wrong number of players.' }
  }

  return {
    ok: true,
    game: received,
    id: envelope.id.trim(),
    createdAt: envelope.at,
    payload,
  }
}

/* -------------------------------------------------------------- QR messages */

/** `U1:<i>/<n>:<id>:<hash>:<chunk>` — the text encoded in one QR code. */
export function partQrText(part: TransferPart): string {
  return `${QR_PREFIX}:${part.index}/${part.total}:${part.id}:${part.hash}:${part.chunk}`
}

/** Turns a payload into one QR, several labelled parts, or a refusal. */
export function planTransfer(payload: string, id: string): TransferPlan {
  if (payload.length === 0) {
    return { mode: 'too-large', total: 0, reason: 'There is nothing to transfer.' }
  }

  const hash = hashOf(payload)
  const header = `${QR_PREFIX}:999/999:${id}:${hash}:`.length
  const chunkSize = Math.max(120, QR_CHAR_LIMIT - header)
  const total = Math.ceil(payload.length / chunkSize)

  if (total > MAX_PARTS) {
    return {
      mode: 'too-large',
      total,
      reason: `This game needs ${total} QR codes, which is too many to scan reliably. Use the game file instead.`,
    }
  }

  const chunks: string[] = []
  for (let index = 0; index < total; index += 1) {
    chunks.push(payload.slice(index * chunkSize, (index + 1) * chunkSize))
  }
  const parts = chunks.map((chunk, index) =>
    partQrText({ index: index + 1, total, id, hash, chunk }),
  )

  // A single code only when it genuinely fits in one comfortable scan.
  if (total === 1 && parts[0].length <= QR_CHAR_LIMIT) {
    return { mode: 'single', parts, total: 1 }
  }
  return { mode: 'multi', parts, total }
}

export type ScanResult =
  | { kind: 'part'; part: TransferPart }
  | { kind: 'invalid'; reason: string }

/** Reads the text of one scanned QR code (or a pasted code string). */
export function parseQrText(text: string): ScanResult {
  const raw = text.trim()
  const pieces = raw.split(':')
  if (pieces.length !== 5 || pieces[0] !== QR_PREFIX) {
    return {
      kind: 'invalid',
      reason: 'That QR code is not a UNO Night transfer.',
    }
  }
  const [, range, id, hash, chunk] = pieces
  const rangeMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(range)
  if (!rangeMatch) return { kind: 'invalid', reason: 'That QR code has no part number.' }

  const index = Number(rangeMatch[1])
  const total = Number(rangeMatch[2])
  if (total < 1 || total > MAX_PARTS || index < 1 || index > total) {
    return { kind: 'invalid', reason: 'That QR code has an impossible part number.' }
  }
  if (!/^[\w-]{4,64}$/.test(id)) {
    return { kind: 'invalid', reason: 'That QR code has a malformed handover id.' }
  }
  if (!/^[0-9a-f]{8}$/.test(hash)) {
    return { kind: 'invalid', reason: 'That QR code has no usable checksum.' }
  }
  if (chunk.length === 0) return { kind: 'invalid', reason: 'That QR code is empty.' }

  return { kind: 'part', part: { index, total, id, hash, chunk } }
}

/* ------------------------------------------------------- multi-part assembly */

export interface ScanSession {
  id: string | null
  total: number | null
  hash: string | null
  chunks: Record<number, string>
  duplicates: number[]
  problems: string[]
}

export function emptyScanSession(): ScanSession {
  return { id: null, total: null, hash: null, chunks: {}, duplicates: [], problems: [] }
}

export interface ScanProgress {
  scanned: number
  total: number | null
  missing: number[]
  duplicates: number[]
  complete: boolean
  problems: string[]
}

export function scanProgress(session: ScanSession): ScanProgress {
  const total = session.total
  const scanned = Object.keys(session.chunks).length
  const missing =
    total === null
      ? []
      : Array.from({ length: total }, (_, index) => index + 1).filter(
          (index) => !(index in session.chunks),
        )
  return {
    scanned,
    total,
    missing,
    duplicates: [...session.duplicates],
    problems: [...session.problems],
    complete: total !== null && missing.length === 0,
  }
}

/**
 * Folds one scanned part into the session. Parts may arrive in any order; parts
 * from a different transfer (or a different payload) are refused outright.
 */
export function addScannedPart(session: ScanSession, part: TransferPart): ScanSession {
  if (session.id !== null && session.id !== part.id) {
    return {
      ...session,
      problems: [
        ...session.problems,
        'That code belongs to a different transfer — finish one transfer at a time.',
      ],
    }
  }
  if (session.hash !== null && session.hash !== part.hash) {
    return {
      ...session,
      problems: [
        ...session.problems,
        'That code belongs to a different transfer — finish one transfer at a time.',
      ],
    }
  }
  if (session.total !== null && session.total !== part.total) {
    return {
      ...session,
      problems: [
        ...session.problems,
        'That code is part of a different sized transfer and was ignored.',
      ],
    }
  }
  if (part.index in session.chunks) {
    const sameChunk = session.chunks[part.index] === part.chunk
    return {
      ...session,
      duplicates: sameChunk
        ? [...new Set([...session.duplicates, part.index])]
        : session.duplicates,
      problems: sameChunk
        ? session.problems
        : [...session.problems, `Part ${part.index} did not match the copy already scanned.`],
    }
  }

  return {
    ...session,
    id: part.id,
    total: part.total,
    hash: part.hash,
    chunks: { ...session.chunks, [part.index]: part.chunk },
  }
}

export type AssembleResult =
  | { ok: true; payload: string; id: string }
  | { ok: false; error: string; missing: number[] }

/** Rebuilds the payload once every part is present, verifying the checksum. */
export function assembleSession(session: ScanSession): AssembleResult {
  const progress = scanProgress(session)
  if (progress.total === null) {
    return { ok: false, error: 'No transfer codes have been scanned yet.', missing: [] }
  }
  if (!progress.complete) {
    const list = progress.missing.join(', ')
    return {
      ok: false,
      error: `Missing ${progress.missing.length} of ${progress.total} codes (part ${list}).`,
      missing: progress.missing,
    }
  }

  let payload = ''
  for (let index = 1; index <= (session.total as number); index += 1) {
    payload += session.chunks[index]
  }

  if (hashOf(payload) !== session.hash) {
    return {
      ok: false,
      error: 'The scanned codes did not rebuild a valid transfer. Scan every code again.',
      missing: [],
    }
  }
  return { ok: true, payload, id: session.id as string }
}

/* ----------------------------------------------------------------- file I/O */

export interface TransferDocument {
  format: typeof TRANSFER_FILE_FORMAT
  version: number
  id: string
  createdAt: number
  gameName: string
  players: string[]
  rounds: number
  payload: string
  checksum: string
}

/** Human-readable wrapper around the same payload the QR codes carry. */
export function buildTransferDocument(
  game: GameState,
  encoded: { id: string; createdAt: number; payload: string },
): TransferDocument {
  return {
    format: TRANSFER_FILE_FORMAT,
    version: TRANSFER_VERSION,
    id: encoded.id,
    createdAt: encoded.createdAt,
    gameName: game.config?.name ?? '',
    players: game.players.map((player) => player.name),
    rounds: game.rounds.length,
    payload: encoded.payload,
    checksum: hashOf(encoded.payload),
  }
}

export type DocumentResult =
  | { ok: true; payload: string; id: string }
  | { ok: false; error: string }

/**
 * Accepts an exported transfer file, a QR code string or a bare payload, so the
 * file fallback, clipboard paste and camera all funnel into one code path.
 */
export function readTransferInput(text: string): DocumentResult {
  const raw = text.trim()
  if (raw.length === 0) return { ok: false, error: 'Paste a transfer file or code first.' }

  if (raw.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' }
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'That file does not contain a transfer.' }
    }
    const document = parsed as Record<string, unknown>
    if (document.format !== TRANSFER_FILE_FORMAT) {
      return { ok: false, error: 'That file is not a UNO Night transfer.' }
    }
    if (document.version !== TRANSFER_VERSION) {
      return {
        ok: false,
        error: 'That transfer file came from a different version of the app.',
      }
    }
    if (typeof document.payload !== 'string' || typeof document.checksum !== 'string') {
      return { ok: false, error: 'That transfer file is incomplete.' }
    }
    if (hashOf(document.payload) !== document.checksum) {
      return { ok: false, error: 'That transfer file is damaged — its checksum does not match.' }
    }
    if (typeof document.id !== 'string' || document.id.length < 4) {
      return { ok: false, error: 'That transfer file is missing its handover id.' }
    }
    return { ok: true, payload: document.payload, id: document.id }
  }

  if (raw.startsWith(`${QR_PREFIX}:`)) {
    const scanned = parseQrText(raw)
    if (scanned.kind === 'invalid') return { ok: false, error: scanned.reason }
    const session = addScannedPart(emptyScanSession(), scanned.part)
    const assembled = assembleSession(session)
    if (!assembled.ok) {
      return {
        ok: false,
        error: `${assembled.error} Scan or paste the remaining codes to finish this transfer.`,
      }
    }
    return { ok: true, payload: assembled.payload, id: assembled.id }
  }

  // Anything else is assumed to be a bare payload from the exported file.
  const decoded = decodeTransfer(raw)
  if (!decoded.ok) return { ok: false, error: decoded.error }
  return { ok: true, payload: decoded.payload, id: decoded.id }
}

/** Suggested download name, e.g. `uno-night-friday-uno.json`. */
export function transferFileName(game: GameState): string {
  const base = (game.config?.name || 'game')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `uno-night-${base || 'game'}.json`
}
