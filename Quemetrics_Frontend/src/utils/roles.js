export function getRoleNames(user) {
  if (!user) return [];

  const activeRole = typeof user.role === 'string' ? user.role : null;
  const roleOptions = Array.isArray(user.availableRoles)
    ? user.availableRoles.map((roleItem) => {
        if (typeof roleItem === 'string') return roleItem;
        return roleItem?.role || null;
      })
    : [];

  return Array.from(new Set([activeRole, ...roleOptions].filter(Boolean)));
}

export function hasAnyRole(user, allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  const roleSet = new Set(getRoleNames(user));
  return allowedRoles.some((role) => roleSet.has(role));
}