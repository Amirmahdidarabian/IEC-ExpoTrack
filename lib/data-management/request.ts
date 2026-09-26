import { HttpError } from "@/lib/auth/errors";
import { MAX_IMPORT_BYTES, parseBackupText, safeImportFilename } from "./schema";

const MULTIPART_OVERHEAD_ALLOWANCE = 512 * 1024;

export async function readBackupUpload(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_IMPORT_BYTES + MULTIPART_OVERHEAD_ALLOWANCE) throw new HttpError("Backup file exceeds the 10 MB limit.", 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new HttpError("Upload must use multipart form data.", 415);
  const form = await request.formData();
  const entry = form.get("file");
  if (!entry || typeof entry === "string" || typeof entry.text !== "function") throw new HttpError("Select a JSON backup file.", 400);
  const file = entry as File;
  const filename = safeImportFilename(file.name);
  if (!filename.toLowerCase().endsWith(".json")) throw new HttpError("Only .json backup files are accepted.", 415);
  if (file.size < 1) throw new HttpError("The selected backup file is empty.", 400);
  if (file.size > MAX_IMPORT_BYTES) throw new HttpError("Backup file exceeds the 10 MB limit.", 413);
  return { filename, backup: parseBackupText(await file.text()) };
}
