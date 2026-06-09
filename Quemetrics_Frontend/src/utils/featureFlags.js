export const isVenueOwnerFeatureEnabled =
  String(import.meta.env.VITE_ENABLE_VENUE_OWNER_ROLE ?? 'true').toLowerCase() !== 'false';