import { Suspense } from "react";
import { HomeClient } from "./HomeClient";
import { getCurrentUser } from "@/lib/auth/session";
import { listHomeExhibitions } from "@/lib/exhibitions/repository";
import { hasPermission } from "@/lib/auth/permissions";
import { Permission } from "@prisma/client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.mustChangePassword) redirect("/settings/account?required=1");
  const now = new Date();
  const canView = Boolean(user && hasPermission(user, Permission.VIEW_EXHIBITIONS));
  const exhibitions = canView ? await listHomeExhibitions(now) : [];
  return <Suspense><HomeClient user={user} exhibitions={exhibitions} asOf={now.toISOString()} canView={canView} /></Suspense>;
}
