// ============================================================
// Service - ZIP portable pour backups TradingBook
// ============================================================
// Format produit :
//   database/tradingbook.db
//   metadata/backup-info.json
//
// Le ZIP reste volontairement simple : entries fichier uniquement, chemins
// relatifs fixes, validation stricte avant restauration.
// ============================================================

import { DB_NAME } from "../../constants/app";

export const BACKUP_ZIP_DATABASE_PATH = `database/${DB_NAME}`;
export const BACKUP_ZIP_METADATA_PATH = "metadata/backup-info.json";

export interface BackupZipMetadata {
  appName: "TradingBook";
  format: "tradingbook-sqlite-backup";
  formatVersion: 1;
  databaseFile: typeof BACKUP_ZIP_DATABASE_PATH;
  createdAt: string;
  compressed: true;
}

export interface BackupZipValidationResult {
  databaseBytes: Uint8Array;
  metadata: BackupZipMetadata;
}

interface ZipEntryInput {
  path: string;
  data: Uint8Array;
}

interface ZipEntryRecord extends ZipEntryInput {
  crc32: number;
  compressedData: Uint8Array;
  compressionMethod: number;
  localHeaderOffset: number;
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_VERSION_NEEDED = 20;
const ZIP_COMPRESSION_STORE = 0;
const ZIP_COMPRESSION_DEFLATE = 8;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let value = 0xffffffff;

  for (const byte of bytes) {
    value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function uint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, value, true);
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value >>> 0, true);
  return bytes;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function getDosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(
      new CompressionStream("deflate-raw"),
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Decompression ZIP non disponible dans cet environnement.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function buildEntryRecord(
  entry: ZipEntryInput,
  localHeaderOffset: number,
): Promise<ZipEntryRecord> {
  const compressed = await deflateRaw(entry.data);
  const useDeflate =
    compressed !== null && compressed.byteLength < entry.data.byteLength;

  return {
    ...entry,
    crc32: crc32(entry.data),
    compressedData: useDeflate ? compressed : entry.data,
    compressionMethod: useDeflate ? ZIP_COMPRESSION_DEFLATE : ZIP_COMPRESSION_STORE,
    localHeaderOffset,
  };
}

function buildLocalHeader(entry: ZipEntryRecord, date: Date): Uint8Array {
  const filename = textEncoder.encode(entry.path);
  const dos = getDosDateTime(date);

  return concatBytes([
    uint32(ZIP_LOCAL_FILE_HEADER),
    uint16(ZIP_VERSION_NEEDED),
    uint16(0),
    uint16(entry.compressionMethod),
    uint16(dos.time),
    uint16(dos.date),
    uint32(entry.crc32),
    uint32(entry.compressedData.byteLength),
    uint32(entry.data.byteLength),
    uint16(filename.byteLength),
    uint16(0),
    filename,
  ]);
}

function buildCentralDirectoryHeader(
  entry: ZipEntryRecord,
  date: Date,
): Uint8Array {
  const filename = textEncoder.encode(entry.path);
  const dos = getDosDateTime(date);

  return concatBytes([
    uint32(ZIP_CENTRAL_DIRECTORY_HEADER),
    uint16(ZIP_VERSION_NEEDED),
    uint16(ZIP_VERSION_NEEDED),
    uint16(0),
    uint16(entry.compressionMethod),
    uint16(dos.time),
    uint16(dos.date),
    uint32(entry.crc32),
    uint32(entry.compressedData.byteLength),
    uint32(entry.data.byteLength),
    uint16(filename.byteLength),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(entry.localHeaderOffset),
    filename,
  ]);
}

function buildEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Uint8Array {
  return concatBytes([
    uint32(ZIP_END_OF_CENTRAL_DIRECTORY),
    uint16(0),
    uint16(0),
    uint16(entryCount),
    uint16(entryCount),
    uint32(centralDirectorySize),
    uint32(centralDirectoryOffset),
    uint16(0),
  ]);
}

async function createZip(entries: ZipEntryInput[]): Promise<Uint8Array> {
  const createdAt = new Date();
  const fileChunks: Uint8Array[] = [];
  const records: ZipEntryRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const record = await buildEntryRecord(entry, offset);
    const localHeader = buildLocalHeader(record, createdAt);
    fileChunks.push(localHeader, record.compressedData);
    records.push(record);
    offset += localHeader.byteLength + record.compressedData.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralChunks = records.map((entry) =>
    buildCentralDirectoryHeader(entry, createdAt),
  );
  const centralDirectory = concatBytes(centralChunks);
  const end = buildEndOfCentralDirectory(
    records.length,
    centralDirectory.byteLength,
    centralDirectoryOffset,
  );

  return concatBytes([...fileChunks, centralDirectory, end]);
}

function findEndOfCentralDirectory(zipBytes: Uint8Array): number {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const minOffset = Math.max(0, zipBytes.byteLength - 65_557);

  for (let offset = zipBytes.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  throw new Error("ZIP invalide : fin de repertoire introuvable.");
}

async function readZipEntries(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const endOffset = findEndOfCentralDirectory(zipBytes);
  const entryCount = readUint16(view, endOffset + 10);
  const centralDirectoryOffset = readUint32(view, endOffset + 16);
  const entries = new Map<string, Uint8Array>();

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, cursor) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error("ZIP invalide : entree centrale incorrecte.");
    }

    const compressionMethod = readUint16(view, cursor + 10);
    const expectedCrc = readUint32(view, cursor + 16);
    const compressedSize = readUint32(view, cursor + 20);
    const filenameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const filenameStart = cursor + 46;
    const path = textDecoder.decode(
      zipBytes.slice(filenameStart, filenameStart + filenameLength),
    );

    if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
      throw new Error(`ZIP invalide : chemin refuse (${path}).`);
    }

    if (readUint32(view, localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error(`ZIP invalide : header local manquant (${path}).`);
    }

    const localFilenameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart =
      localHeaderOffset + 30 + localFilenameLength + localExtraLength;
    const compressedBytes = zipBytes.slice(dataStart, dataStart + compressedSize);

    const data =
      compressionMethod === ZIP_COMPRESSION_DEFLATE
        ? await inflateRaw(compressedBytes)
        : compressionMethod === ZIP_COMPRESSION_STORE
          ? compressedBytes
          : null;

    if (!data) {
      throw new Error(`ZIP invalide : compression non supportee (${path}).`);
    }

    if (crc32(data) !== expectedCrc) {
      throw new Error(`ZIP invalide : controle CRC echoue (${path}).`);
    }

    entries.set(path, data);
    cursor += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

export function createBackupZipMetadata(createdAt: string): BackupZipMetadata {
  return {
    appName: "TradingBook",
    format: "tradingbook-sqlite-backup",
    formatVersion: 1,
    databaseFile: BACKUP_ZIP_DATABASE_PATH,
    createdAt,
    compressed: true,
  };
}

export async function createTradingBookBackupZip(
  databaseBytes: Uint8Array,
  metadata: BackupZipMetadata,
): Promise<Uint8Array> {
  return createZip([
    {
      path: BACKUP_ZIP_DATABASE_PATH,
      data: databaseBytes,
    },
    {
      path: BACKUP_ZIP_METADATA_PATH,
      data: textEncoder.encode(JSON.stringify(metadata, null, 2)),
    },
  ]);
}

export async function validateTradingBookBackupZip(
  zipBytes: Uint8Array,
): Promise<BackupZipValidationResult> {
  const entries = await readZipEntries(zipBytes);
  const databaseBytes = entries.get(BACKUP_ZIP_DATABASE_PATH);
  const metadataBytes = entries.get(BACKUP_ZIP_METADATA_PATH);

  if (!databaseBytes || databaseBytes.byteLength === 0) {
    throw new Error("ZIP invalide : database/tradingbook.db est absent.");
  }

  if (!metadataBytes) {
    throw new Error("ZIP invalide : metadata/backup-info.json est absent.");
  }

  const metadata = JSON.parse(textDecoder.decode(metadataBytes)) as BackupZipMetadata;
  if (
    metadata.appName !== "TradingBook" ||
    metadata.format !== "tradingbook-sqlite-backup" ||
    metadata.formatVersion !== 1 ||
    metadata.databaseFile !== BACKUP_ZIP_DATABASE_PATH
  ) {
    throw new Error("ZIP invalide : metadata backup non reconnues.");
  }

  return { databaseBytes, metadata };
}
