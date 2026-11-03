export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.trim().length === 0) return false;
  if (slug.length > 64) return false;
  if (!/^[a-z0-9]/.test(slug)) return false;
  if (!/[a-z0-9]$/.test(slug)) return false;
  if (!/^[a-z0-9-]*$/.test(slug)) return false;
  if (slug.includes('--')) return false;
  return true;
}

export function getSlugError(slug: string): string | null {
  if (!slug || slug.trim().length === 0) {
    return 'Slug cannot be empty';
  }
  if (slug.length > 64) {
    return 'Slug must be 64 characters or less';
  }
  if (!/^[a-z]/.test(slug)) {
    return 'Slug must start with a lowercase letter';
  }
  if (!/[a-z0-9]$/.test(slug)) {
    return 'Slug must end with a lowercase letter or number';
  }
  if (!/^[a-z0-9-]*$/.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens';
  }
  if (slug.includes('--')) {
    return 'Slug cannot contain consecutive hyphens';
  }
  return null;
}

const SLUG_MAX = 64;

/**
 * A valid slug derived from a client name (empty when the name has no usable
 * characters): lowercase, single hyphens, no leading/trailing hyphen, ≤ 56
 * chars so a uniqueness suffix still fits.
 */
export function clientSlugBase(name: string): string {
  return generateSlug(name.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
    .replace(/-+/g, '-')
    .slice(0, SLUG_MAX - 8)
    .replace(/-+$/g, '');
}

/** `base` with a short random suffix (used when the plain slug is taken). */
export function withSuffix(base: string, attempt: number): string {
  const suffix = attempt === 1 ? '2' : Math.random().toString(36).slice(2, 7);
  return `${base.slice(0, SLUG_MAX - suffix.length - 1)}-${suffix}`;
}
