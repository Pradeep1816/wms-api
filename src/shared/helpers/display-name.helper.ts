export interface DisplayNameLike {
  id?: number | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profile?: {
    firstname?: string | null;
    lastname?: string | null;
  } | null;
}

export function getDisplayName(
  entity: DisplayNameLike | null | undefined,
  fallbackLabel: string = 'User',
): string {
  if (!entity) {
    return 'Unknown';
  }

  const firstName =
    entity.firstName?.trim() ||
    entity.profile?.firstname?.trim() ||
    '';
  const lastName =
    entity.lastName?.trim() ||
    entity.profile?.lastname?.trim() ||
    '';
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || entity.username || `${fallbackLabel} ${entity.id ?? ''}`.trim();
}
