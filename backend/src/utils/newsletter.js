function normalizeRole(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_ -]/g, "");
}

function readPath(source, path) {
  return path.reduce((value, key) => {
    if (value === null || value === undefined) return undefined;
    return value[key];
  }, source);
}

export function getNewsletterViewerRole(metadata) {
  const rolePaths = [
    ["viewer_metadata", "view_role"],
    ["viewer_metadata", "viewer_role"],
    ["viewer_metadata", "viewerRole"],
    ["viewer_metadata", "role"],
    ["viewerMetadata", "viewRole"],
    ["viewerMetadata", "viewerRole"],
    ["viewerMetadata", "role"],
    ["viewer", "role"],
    ["me", "role"],
    ["role"],
    ["view_role"],
    ["viewer_role"],
  ];

  for (const path of rolePaths) {
    const role = normalizeRole(readPath(metadata, path));
    if (role) return role;
  }

  return "";
}

export function isNewsletterAdminRole(role) {
  const normalized = normalizeRole(role);
  return normalized.includes("ADMIN") || normalized.includes("OWNER");
}

