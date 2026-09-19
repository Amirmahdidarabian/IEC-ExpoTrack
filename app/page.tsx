import { Suspense } from "react";
import { HomeClient } from "./HomeClient";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home() { const user = await getCurrentUser(); return <Suspense><HomeClient user={user} /></Suspense>; }
