import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/auth/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, requireAuthenticatedUser } from "@/lib/auth/session";
import { ownAccountSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser({ allowPasswordChange: true });
    const input = ownAccountSchema.parse(await request.json());
    if (!input.username && !input.newPassword) throw new HttpError("No account changes were supplied.", 400);
    const current = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { username: true, passwordHash: true } });
    if (!await verifyPassword(input.currentPassword, current.passwordHash)) throw new HttpError("Current password is incorrect.", 400);
    if (input.newPassword === input.currentPassword) throw new HttpError("New password must be different from the current password.", 400);
    const passwordHash = input.newPassword ? await hashPassword(input.newPassword) : undefined;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: actor.id }, data: { username: input.username, passwordHash, mustChangePassword: input.newPassword ? false : undefined } });
        if (input.newPassword) await tx.session.deleteMany({ where: { userId: actor.id } });
        if (input.username && input.username !== current.username) await tx.auditLog.create({ data: { actorUserId: actor.id, action: "CHANGE_USERNAME", entityType: "USER", entityId: actor.id, entityLabel: input.username, description: `Changed username from ${current.username} to ${input.username}` } });
        if (input.newPassword) await tx.auditLog.create({ data: { actorUserId: actor.id, action: "CHANGE_OWN_PASSWORD", entityType: "USER", entityId: actor.id, entityLabel: input.username ?? current.username, description: "Changed own password" } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError("That username is already in use.", 409);
      throw error;
    }
    if (input.newPassword) await createSession(actor.id);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error, "Unable to update account."); }
}
