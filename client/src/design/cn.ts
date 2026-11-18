export type ClassValue = string | false | null | undefined;

/** Tiny className joiner (no dependency). */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
