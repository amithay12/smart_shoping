/**
 * Normalize store name/chain strings from CHP or DB by removing invisible Unicode
 * (zero-width joiners, bidi marks, etc.) that cause "garbage" display in the app.
 * @param {string} str - Raw string (e.g. store.name, store.chain)
 * @returns {string} Normalized string, or '' if input is falsy
 */
function normalizeStoreText(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/[\u200B-\u200D\u2060\uFEFF\u200E\u200F\u202A-\u202E\u034F\u00AD]/g, '') // ZWSP, ZWNJ, ZWJ, WJ, BOM, bidi, CGJ, soft hyphen
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if the normalized store name looks invalid/corrupted (e.g. mixed garbage from encoding).
 * Israeli store names are typically Hebrew with possibly "local", "am:pm", etc.
 * @param {string} normalized - Already normalized name
 * @returns {boolean} true if we should hide this store from the list
 */
function isInvalidStoreName(normalized) {
  if (!normalized || normalized.length < 2) return true;
  const noSpaces = normalized.replace(/\s/g, '');
  if (noSpaces.length < 2) return true;
  const hebrewLetters = (normalized.match(/[\u0590-\u05FF]/g) || []).length;
  const asciiOrDigits = (normalized.match(/[a-zA-Z0-9]/g) || []).length;
  const totalLetters = hebrewLetters + asciiOrDigits;
  if (totalLetters === 0) return true;
  // All-ASCII or mostly ASCII with no Hebrew => likely corrupted
  if (asciiOrDigits / totalLetters > 0.6 && hebrewLetters === 0) return true;
  // Mixed garbage: 4+ ASCII/digits mixed into Hebrew and count >= Hebrew => corrupted (e.g. "נס צCיULונvJהIY5")
  // Legit names like "ויקטורי local" have more Hebrew than ASCII, so we keep them
  if (asciiOrDigits >= 4 && asciiOrDigits >= hebrewLetters) return true;
  return false;
}

/**
 * Extract Hebrew (+ spaces) only from a store/chain name for matching.
 * CHP sometimes returns corrupted names like "נס צwLjיוdBYנv2ה"; this yields "נס ציונה"
 * so we can match DB stores and still use the distance.
 * @param {string} str - Raw or normalized name
 * @returns {string} Hebrew and spaces only, trimmed and collapsed
 */
function getCanonicalStoreKey(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/[\u200B-\u200D\u2060\uFEFF\u200E\u200F\u202A-\u202E\u034F\u00AD]/g, '')
    .replace(/[^\u0590-\u05FF\s]/g, '') // keep Hebrew and spaces only
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeStoreText, isInvalidStoreName, getCanonicalStoreKey };
