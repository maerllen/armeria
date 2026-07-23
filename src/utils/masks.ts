/**
 * Cleans non-digit characters from MASP string.
 */
export function cleanMasp(input: string): string {
  if (!input) return '';
  return input.replace(/\D/g, '');
}

/**
 * Formats MASP string with mask:
 * - 8 digits: x.xxx.xxx-x (e.g., 1.255.748-0)
 * - 7 digits: xxx.xxx-x (e.g., 125.574-8)
 * - fallback for other lengths
 */
export function formatMasp(maspRaw: string): string {
  const digits = cleanMasp(maspRaw);
  if (!digits) return '';

  if (digits.length === 8) {
    return `${digits[0]}.${digits.slice(1, 4)}.${digits.slice(4, 7)}-${digits[7]}`;
  } else if (digits.length === 7) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits[6]}`;
  } else if (digits.length > 4) {
    const main = digits.slice(0, -1);
    const last = digits.slice(-1);
    return `${main}-${last}`;
  }

  return digits;
}

/**
 * Cleans phone numbers to digits only.
 */
export function cleanPhone(input: string): string {
  if (!input) return '';
  return input.replace(/\D/g, '');
}

/**
 * Formats phone string with mask: (xx) x xxxx-xxxx or (xx) xxxx-xxxx
 */
export function formatPhone(raw: string): string {
  const digits = cleanPhone(raw);
  if (!digits) return '';

  if (digits.length >= 11) {
    return `(${digits.slice(0, 2)}) ${digits[2]} ${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  } else if (digits.length > 2) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  return digits;
}

/**
 * Formats date input string to DD/MM/YYYY
 */
export function formatDisplayDate(dateInput: string): string {
  if (!dateInput) return '';

  // If already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-');
    return `${d}/${m}/${y}`;
  }

  // If digits only
  const digits = dateInput.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }

  return dateInput;
}

/**
 * Normalizes a DD/MM/YYYY or YYYY-MM-DD string into a standard Date object
 */
export function parseDate(dateInput: string): Date | null {
  if (!dateInput) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return new Date(dateInput + 'T00:00:00');
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
    const [d, m, y] = dateInput.split('/');
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }

  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Checks if a course completion date is older than 2 years (730 days) from today.
 * Returns true if expired (> 2 years old).
 */
export function isCourseExpired(dateInput: string): boolean {
  const courseDate = parseDate(dateInput);
  if (!courseDate) return false;

  const now = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(now.getFullYear() - 2);

  return courseDate < twoYearsAgo;
}

/**
 * Formats date to local ISO string (YYYY-MM-DD)
 */
export function toIsoDate(dateInput: string): string {
  const d = parseDate(dateInput);
  if (!d) return dateInput;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats full timestamp for display: DD/MM/YYYY às HH:mm
 */
export function formatTimestamp(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}
