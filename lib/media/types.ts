import type { getMedia, listMedia, mediaOptions } from "./repository";
type Json<T> = T extends Date ? string : T extends (infer U)[] ? Json<U>[] : T extends object ? {[K in keyof T]:Json<T[K]>} : T;
export type MediaList=Json<Awaited<ReturnType<typeof listMedia>>>;
export type MediaOptions=Awaited<ReturnType<typeof mediaOptions>>;
export type MediaDetail=Json<Awaited<ReturnType<typeof getMedia>>>;
export type MediaAbilities={canCreate:boolean;canUpdate:boolean;canDelete:boolean;canImport:boolean;canManageTaxonomy:boolean};
