"use client";

import { Download } from "lucide-react";
import { downloadDiagnostics } from "@/lib/client/diagnostics";

export function DownloadDiagnosticsButton() {
  return <button className="button outline" type="button" data-diagnostics onClick={downloadDiagnostics}><Download aria-hidden="true" />Download diagnostics (.txt)</button>;
}
