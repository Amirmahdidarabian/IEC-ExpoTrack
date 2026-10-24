import { HttpError } from "@/lib/auth/errors";
import { MAX_IMPORT_BYTES, parseBackupText, safeImportFilename } from "./schema";

const MULTIPART_OVERHEAD_ALLOWANCE = 512 * 1024;

export async function readBackupUpload(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_IMPORT_BYTES + MULTIPART_OVERHEAD_ALLOWANCE) throw new HttpError("Backup file exceeds the 50 MB limit.", 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new HttpError("Upload must use multipart form data.", 415);
  // Enforce the bound while reading, including chunked requests with no Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("Select a JSON backup file.", 400);
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_IMPORT_BYTES + MULTIPART_OVERHEAD_ALLOWANCE) { await reader.cancel(); throw new HttpError("Backup file exceeds the 50 MB limit.", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new HttpError("The upload is not valid multipart form data.", 400); }
  const entry = form.get("file");
  if (!entry || typeof entry === "string" || typeof entry.text !== "function") throw new HttpError("Select a JSON backup file.", 400);
  const file = entry as File;
  const filename = safeImportFilename(file.name);
  if (!filename.toLowerCase().endsWith(".json")) throw new HttpError("Only .json backup files are accepted.", 415);
  if (file.size < 1) throw new HttpError("The selected backup file is empty.", 400);
  if (file.size > MAX_IMPORT_BYTES) throw new HttpError("Backup file exceeds the 50 MB limit.", 413);
  return { filename, backup: parseBackupText(await file.text()) };
}
