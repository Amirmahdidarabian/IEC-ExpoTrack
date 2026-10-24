import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/errors";
import { normalizeCompanyName } from "./normalization";
import { folderSchema, membershipSchema } from "./folder-schema";

export async function listCompanyFolders() {
  const [folders, total, unfiled] = await Promise.all([
    prisma.companyFolder.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], include: { _count: { select: { companies: true } } } }),
    prisma.company.count(), prisma.company.count({ where: { folders: { none: {} } } }),
  ]);
  return { folders: folders.map(({ _count, ...folder }) => ({ ...folder, companyCount: _count.companies })), total, unfiled };
}

export async function saveCompanyFolder(raw: unknown, actorId: string, id?: string) {
  const input = folderSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const data = { ...input, normalizedName: normalizeCompanyName(input.name) };
    const folder = id ? await tx.companyFolder.update({ where: { id }, data }) : await tx.companyFolder.create({ data });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: id ? "COMPANY_FOLDER_UPDATED" : "COMPANY_FOLDER_CREATED", entityType: "COMPANY_FOLDER", entityId: folder.id, entityLabel: folder.name, description: `${id ? "Updated" : "Created"} company folder` } });
    return folder;
  });
}

export async function deleteCompanyFolder(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const folder = await tx.companyFolder.findUniqueOrThrow({ where: { id } });
    // Only membership links cascade. Companies, contacts and classifications survive.
    await tx.companyFolder.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_FOLDER_DELETED", entityType: "COMPANY_FOLDER", entityId: id, entityLabel: folder.name, description: "Deleted company folder only; company records preserved" } });
  });
}

export async function changeFolderMembership(raw: unknown, actorId: string) {
  const input = membershipSchema.parse(raw); const companyIds = [...new Set(input.companyIds)];
  return prisma.$transaction(async (tx) => {
    const folder = await tx.companyFolder.findUnique({ where: { id: input.folderId } });
    if (!folder) throw new HttpError("Folder not found.", 404);
    if (await tx.company.count({ where: { id: { in: companyIds } } }) !== companyIds.length) throw new HttpError("One or more companies were not found.", 404);
    const result = input.action === "add"
      ? await tx.companyFolderMembership.createMany({ data: companyIds.map((companyId) => ({ companyId, folderId: input.folderId })), skipDuplicates: true })
      : await tx.companyFolderMembership.deleteMany({ where: { folderId: input.folderId, companyId: { in: companyIds } } });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "COMPANY_FOLDERS_UPDATED", entityType: "COMPANY_FOLDER", entityId: folder.id, entityLabel: folder.name, description: `${input.action === "add" ? "Added to" : "Removed from"} company folder; company records preserved`, metadata: { companyIds, changed: result.count } } });
    return { changed: result.count };
  });
}
