"use client";

import { useEffect } from "react";
import Link from "next/link";
import { recordDiagnostic } from "@/lib/client/diagnostics";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { recordDiagnostic("page_error", `${error.message} — reference ${error.digest ?? "none"}`); }, [error]);
  return <main className="route-error"><h1>This page could not be loaded</h1><p>Please try again. Your diagnostic report includes the error reference.</p>{error.digest && <small>Reference: {error.digest}</small>}<div><button className="button primary" onClick={reset}>Try again</button><Link className="button outline" href="/">Home</Link></div></main>;
}
