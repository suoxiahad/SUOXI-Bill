/**
 * Converts Bengali digits (০-৯) to standard English digits (0-9).
 */
export function convertBengaliToEnglishDigits(str?: string | number | null): string {
  if (!str) return '';
  const bnToEnMap: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  return String(str).replace(/[০-৯]/g, (char) => bnToEnMap[char] || char);
}

/**
 * Normalizes phone numbers by converting Bengali digits to English and stripping non-digits.
 * Also standardizes Bangladeshi international prefixes (e.g., +880, 880 -> 0).
 */
export function normalizePhoneDigits(phone?: string | number | null): string {
  if (!phone) return '';
  const converted = convertBengaliToEnglishDigits(phone);
  let digits = converted.replace(/\D/g, '');
  if (digits.startsWith('880')) {
    digits = digits.slice(2); // turns 88017... into 017...
  } else if (digits.startsWith('88') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

/**
 * Normalizes text for fuzzy token and substring matching (removes punctuation, excess whitespace).
 */
export function normalizeSearchText(text?: string | number | null): string {
  if (!text) return '';
  return convertBengaliToEnglishDigits(text)
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    address?: string;
  }
): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim().toLowerCase();
  const normalizedQuery = normalizeSearchText(rawQuery);
  const queryDigits = normalizePhoneDigits(rawQuery);

  // 1. Check Phone (Smart Phone Match)
  if (patient.phone) {
    const rawPhone = String(patient.phone).toLowerCase();
    if (rawPhone.includes(rawQuery) || (normalizedQuery.length >= 3 && rawPhone.includes(normalizedQuery))) {
      return true;
    }

    if (queryDigits.length >= 3) {
      const patientDigits = normalizePhoneDigits(patient.phone);
      if (patientDigits.includes(queryDigits)) {
        return true;
      }
      const queryNoZero = queryDigits.replace(/^0+/, '');
      const patientNoZero = patientDigits.replace(/^0+/, '');

      if (queryNoZero.length >= 3 && patientDigits.includes(queryNoZero)) {
        return true;
      }
      if (patientNoZero.length >= 3 && queryDigits.includes(patientNoZero)) {
        return true;
      }
      if (queryNoZero.length >= 3 && patientNoZero.length >= 3 && patientNoZero.includes(queryNoZero)) {
        return true;
      }
    }
  }

  // 2. Check Name (case-insensitive substring and multi-word token match)
  if (patient.name) {
    const normPatientName = normalizeSearchText(patient.name);
    if (patient.name.toLowerCase().includes(rawQuery) || normPatientName.includes(normalizedQuery)) {
      return true;
    }
    // Check if all tokens in query exist in patient name
    const queryTokens = normalizedQuery.split(' ').filter(t => t.length >= 2);
    if (queryTokens.length > 1 && queryTokens.every(token => normPatientName.includes(token))) {
      return true;
    }
  }

  // 3. Check Serial Number (Exact, stripped leading zeros, e.g. '#01', '1', '০১')
  if (patient.serialNo !== undefined && patient.serialNo !== null && patient.serialNo !== '') {
    const rawSerial = convertBengaliToEnglishDigits(String(patient.serialNo)).toLowerCase().trim().replace(/^#/, '');
    const cleanQuerySerial = convertBengaliToEnglishDigits(rawQuery).toLowerCase().trim().replace(/^#/, '');
    const serialNoZero = rawSerial.replace(/^0+/, '');
    const querySerialNoZero = cleanQuerySerial.replace(/^0+/, '');

    if (
      rawSerial === cleanQuerySerial || 
      (querySerialNoZero && serialNoZero === querySerialNoZero) ||
      (cleanQuerySerial.length >= 2 && rawSerial.includes(cleanQuerySerial))
    ) {
      return true;
    }
  }

  // 4. Check Doctor Name / Department
  if (patient.doctorName) {
    const normDoctor = normalizeSearchText(patient.doctorName);
    if (normDoctor.includes(normalizedQuery)) {
      return true;
    }
  }
  if (patient.department) {
    const normDept = normalizeSearchText(patient.department);
    if (normDept.includes(normalizedQuery)) {
      return true;
    }
  }

  // 5. Check Notes, Remark & Address
  if (patient.notes) {
    const normNotes = normalizeSearchText(patient.notes);
    if (normNotes.includes(normalizedQuery)) return true;
    if (queryDigits.length >= 3 && normalizePhoneDigits(patient.notes).includes(queryDigits)) return true;
  }
  if (patient.remark) {
    const normRemark = normalizeSearchText(patient.remark);
    if (normRemark.includes(normalizedQuery)) return true;
    if (queryDigits.length >= 3 && normalizePhoneDigits(patient.remark).includes(queryDigits)) return true;
  }
  if (patient.address) {
    const normAddr = normalizeSearchText(patient.address);
    if (normAddr.includes(normalizedQuery)) return true;
    if (queryDigits.length >= 3 && normalizePhoneDigits(patient.address).includes(queryDigits)) return true;
  }

  return false;
}

/**
 * Generic search matcher for any list of fields.
 */
export function matchSearchQuery(
  query: string,
  fields: (string | number | undefined | null)[]
): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim().toLowerCase();
  const normalizedQuery = normalizeSearchText(rawQuery);
  const queryDigits = normalizePhoneDigits(rawQuery);

  for (const field of fields) {
    if (field === undefined || field === null) continue;
    const str = String(field).toLowerCase();
    const normField = normalizeSearchText(str);

    // Direct text substring match (field contains query)
    if (str.includes(rawQuery) || normField.includes(normalizedQuery)) {
      return true;
    }

    // Multi-word token match
    const queryTokens = normalizedQuery.split(' ').filter(t => t.length >= 2);
    if (queryTokens.length > 1 && queryTokens.every(token => normField.includes(token))) {
      return true;
    }

    // Phone / numeric digit match (field digits must contain query digits)
    if (queryDigits.length >= 3) {
      const fieldDigits = normalizePhoneDigits(str);
      if (fieldDigits.length >= 3 && fieldDigits.includes(queryDigits)) {
        return true;
      }
      const queryNoZero = queryDigits.replace(/^0+/, '');
      const fieldNoZero = fieldDigits.replace(/^0+/, '');
      if (queryNoZero.length >= 3 && fieldDigits.includes(queryNoZero)) {
        return true;
      }
      if (fieldNoZero.length >= 3 && queryDigits.includes(fieldNoZero)) {
        return true;
      }
      if (queryNoZero.length >= 3 && fieldNoZero.length >= 3 && fieldNoZero.includes(queryNoZero)) {
        return true;
      }
    }
  }

  return false;
}

