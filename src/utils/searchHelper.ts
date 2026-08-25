/**
 * Normalizes phone numbers by stripping all non-digit characters (+, -, spaces, parentheses).
 * Also normalizes Bangladeshi international prefix 880 -> 0.
 */
export function normalizePhoneDigits(phone?: string | number | null): string {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('880')) {
    digits = digits.slice(2); // turns 88017... into 017...
  } else if (digits.startsWith('88') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

/**
 * Specifically matches a Patient record against a search query.
 */
export function matchPatient(
  query: string,
  patient: {
    name?: string;
    phone?: string;
    serialNo?: string | number;
    notes?: string;
    remark?: string;
    doctorName?: string;
    department?: string;
  }
): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim().toLowerCase();
  const queryDigits = normalizePhoneDigits(rawQuery);

  // 1. Check Name (case-insensitive substring)
  if (patient.name && patient.name.toLowerCase().includes(rawQuery)) {
    return true;
  }

  // 2. Check Doctor Name / Department
  if (patient.doctorName && patient.doctorName.toLowerCase().includes(rawQuery)) {
    return true;
  }
  if (patient.department && patient.department.toLowerCase().includes(rawQuery)) {
    return true;
  }

  // 3. Check Phone (Smart Phone Match - Record MUST contain query digits)
  if (patient.phone) {
    const rawPhone = String(patient.phone).toLowerCase();
    if (rawPhone.includes(rawQuery)) {
      return true;
    }

    if (queryDigits.length >= 3) {
      const patientDigits = normalizePhoneDigits(patient.phone);
      if (patientDigits.includes(queryDigits)) {
        return true;
      }
      // If query was typed without leading zero (e.g. '1621170670' matching '01621170670')
      const queryNoLeadingZero = queryDigits.replace(/^0+/, '');
      if (queryNoLeadingZero.length >= 3 && patientDigits.includes(queryNoLeadingZero)) {
        return true;
      }
    }
  }

  // 4. Check Serial Number (Exact or contains query, e.g. '#211' or '211')
  if (patient.serialNo !== undefined && patient.serialNo !== null && patient.serialNo !== '') {
    const serialStr = String(patient.serialNo).toLowerCase().replace(/^#/, '');
    const cleanQuerySerial = rawQuery.replace(/^#/, '');
    if (serialStr === cleanQuerySerial || serialStr.includes(cleanQuerySerial)) {
      return true;
    }
  }

  // 5. Check Notes / Remark (Only for text search, ignore if user entered a phone number of 7+ digits)
  if (queryDigits.length < 7) {
    if (patient.notes && patient.notes.toLowerCase().includes(rawQuery)) {
      return true;
    }
    if (patient.remark && patient.remark.toLowerCase().includes(rawQuery)) {
      return true;
    }
  }

  return false;
}

/**
 * Generic search matcher for any list of fields.
 * Always checks if FIELD contains QUERY (never query containing field).
 */
export function matchSearchQuery(
  query: string,
  fields: (string | number | undefined | null)[]
): boolean {
  if (!query || !query.trim()) return true;

  const cleanQuery = query.trim().toLowerCase();
  const queryDigits = normalizePhoneDigits(cleanQuery);

  for (const field of fields) {
    if (field === undefined || field === null) continue;
    const str = String(field).toLowerCase();

    // Direct text substring match (field contains query)
    if (str.includes(cleanQuery)) {
      return true;
    }

    // Phone / numeric digit match (field digits must contain query digits)
    if (queryDigits.length >= 3) {
      const fieldDigits = normalizePhoneDigits(str);
      if (fieldDigits.length >= 3 && fieldDigits.includes(queryDigits)) {
        return true;
      }
      const queryNoZero = queryDigits.replace(/^0+/, '');
      if (queryNoZero.length >= 3 && fieldDigits.includes(queryNoZero)) {
        return true;
      }
    }
  }

  return false;
}

