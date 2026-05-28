// ============================================================
// Service - Stockage local des fichiers d'import
// ============================================================
// Les composants React fournissent un File navigateur, mais toute logique de
// chemin et d'ecriture disque reste centralisee ici.
//
// Organisation standard :
//   imports/{timestamp}_{nom-original-nettoye}.csv
// ============================================================

import { writeFile } from "@tauri-apps/plugin-fs";
import { getImportFilePath } from "../filesystem";

export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

export interface StoredImportFile {
  originalName: string;
  storedFilename: string;
  storedPath: string;
  sizeBytes: number;
  selectedAt: string;
  bytes: Uint8Array;
  text: string;
}

function generateStoredFilename(originalName: string): string {
  const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}_${sanitized}`;
}

function assertCsvFile(file: File): void {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "csv") {
    throw new Error("Fichier invalide : seuls les fichiers .csv sont acceptes.");
  }

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error("Fichier trop volumineux.");
  }
}

function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result;
      if (buffer instanceof ArrayBuffer) {
        resolve(new Uint8Array(buffer));
      } else {
        reject(new Error("Lecture du fichier echouee : resultat inattendu."));
      }
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier."));
    reader.readAsArrayBuffer(file);
  });
}

export async function storeImportFile(file: File): Promise<StoredImportFile> {
  assertCsvFile(file);

  const bytes = await readFileAsBytes(file);
  const storedFilename = generateStoredFilename(file.name);
  const storedPath = await getImportFilePath(storedFilename);

  await writeFile(storedPath, bytes);

  return {
    originalName: file.name,
    storedFilename,
    storedPath,
    sizeBytes: file.size,
    selectedAt: new Date().toISOString(),
    bytes,
    text: new TextDecoder("utf-8").decode(bytes),
  };
}
