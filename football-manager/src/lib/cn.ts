type ClassValue = string | boolean | undefined | null | Record<string, boolean | undefined | null>;

export function cn(...classes: ClassValue[]): string {
  return classes
    .filter(Boolean)
    .map(c => {
      if (typeof c === 'object' && c !== null) {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
          .join(' ');
      }
      return c;
    })
    .join(' ');
}
