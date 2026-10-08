/** Reponses JSON standardisees des routes API. */
export function jsonError(status: number, message: string, code?: string) {
  return Response.json({ error: message, code }, { status });
}

export const ERR = {
  NON_AUTORISE: () => jsonError(401, "Authentification requise", "UNAUTHENTICATED"),
  INTERDIT: () => jsonError(403, "Role insuffisant pour cette operation", "FORBIDDEN"),
  DOSIER_TROUVE: () => jsonError(404, "Dossier introuvable", "CASE_NOT_FOUND"),
  PREUVE_TROUVEE: () => jsonError(404, "Preuve introuvable", "EVIDENCE_NOT_FOUND"),
} as const;
