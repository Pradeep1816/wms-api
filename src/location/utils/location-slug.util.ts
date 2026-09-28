/**
 * Generate URL-safe slug from name (e.g. "My Studio" → "my-studio").
 * Shared between create and update flows to keep behavior identical.
 */
export function generateLocationSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'location'
  );
}

