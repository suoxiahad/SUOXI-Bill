/**
 * Normalizes phone numbers by stripping all non-digit characters (+, -, spaces, parentheses).
 */
export function normalizePhoneDigits(phone?: string | number | null): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Robust search query matcher that checks text substrings and normalized phone digits.
 * Supports:
 * - Direct substring matching (case-insensitive)
 * - Country code variations (e.g., +88017..., 88017..., 017..., 17...)
 * - Dashed/spaced phone numbers (e.g., 01711-223344 matches 01711223344)
 * - Partial serial numbers, names, notes, and quotation numbers
 */
export function matchSearchQuery(
  query: string,
  fields: (string | number | undefined | null)[]
): boolean {
  if (!query || !query.trim()) return true;

  const cleanQuery = query.trim().toLowerCase();
  const queryDigits = cleanQuery.replace(/\D/g, '');

  for (const field of fields) {
    if (field === undefined || field === null) continue;
    const str = String(field).toLowerCase();

    // 1. Direct text substring match
    if (str.includes(cleanQuery)) {
      return true;
    }

    // 2. Normalized digit matching (if query has at least 3 digits)
    if (queryDigits.length >= 3) {
      const fieldDigits = str.replace(/\D/g, '');
      if (fieldDigits.length >= 3) {
        if (
          fieldDigits.includes(queryDigits) ||
          (queryDigits.length >= 7 && queryDigits.includes(fieldDigits))
        ) {
          return true;
        }

        // Check for Bangladesh mobile number prefix variations (880 vs 0 vs no leading 0)
        const stripPrefix = (d: string) => {
          if (d.startsWith('880')) return d.slice(2); // '017...'
          if (d.startsWith('88')) return d.slice(2);
          return d;
        };

        const qNorm = stripPrefix(queryDigits);
        const fNorm = stripPrefix(fieldDigits);

        if (fNorm.includes(qNorm) || qNorm.includes(fNorm)) {
          return true;
        }

        // Compare without leading zero
        const qNoZero = qNorm.replace(/^0+/, '');
        const fNoZero = fNorm.replace(/^0+/, '');
        if (qNoZero.length >= 4 && (fNoZero.includes(qNoZero) || qNoZero.includes(fNoZero))) {
          return true;
        }
      }
    }
  }

  return false;
}
