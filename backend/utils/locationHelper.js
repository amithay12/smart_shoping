/**
 * Location Helper
 * Handles location input for CHP API (supports full addresses like chp.co.il)
 */

// Major Israeli cities with their approximate coordinates
// Format: { lat: [min, max], lng: [min, max], name: 'Hebrew city name' }
const ISRAELI_CITIES = [
  { lat: [32.0, 32.2], lng: [34.7, 34.9], name: 'תל אביב' }, // Tel Aviv
  { lat: [31.7, 31.8], lng: [35.1, 35.3], name: 'ירושלים' }, // Jerusalem
  { lat: [32.7, 32.9], lng: [34.9, 35.1], name: 'חיפה' }, // Haifa
  { lat: [31.2, 31.3], lng: [34.7, 34.8], name: 'באר שבע' }, // Be'er Sheva
  { lat: [32.0, 32.1], lng: [34.8, 34.9], name: 'רמת גן' }, // Ramat Gan
  { lat: [32.0, 32.1], lng: [34.7, 34.8], name: 'גבעתיים' }, // Givatayim
  { lat: [32.1, 32.2], lng: [34.8, 34.9], name: 'בני ברק' }, // Bnei Brak
  { lat: [32.0, 32.1], lng: [34.9, 35.0], name: 'הרצליה' }, // Herzliya
  { lat: [32.1, 32.2], lng: [34.8, 34.9], name: 'רעננה' }, // Ra'anana
  { lat: [32.0, 32.1], lng: [34.9, 35.0], name: 'נתניה' }, // Netanya
  { lat: [32.8, 32.9], lng: [35.0, 35.1], name: 'טירת כרמל' }, // Tirat Carmel
  { lat: [32.7, 32.8], lng: [35.0, 35.1], name: 'קריית אתא' }, // Kiryat Ata
  { lat: [32.8, 32.9], lng: [35.0, 35.1], name: 'קריית ביאליק' }, // Kiryat Bialik
  { lat: [31.9, 32.0], lng: [34.8, 34.9], name: 'ראשון לציון' }, // Rishon LeZion
  { lat: [31.9, 32.0], lng: [34.8, 34.9], name: 'רחובות' }, // Rehovot
  { lat: [32.0, 32.1], lng: [34.8, 34.9], name: 'פתח תקווה' }, // Petah Tikva
  { lat: [32.0, 32.1], lng: [34.9, 35.0], name: 'כפר סבא' }, // Kfar Saba
  { lat: [32.1, 32.2], lng: [34.8, 34.9], name: 'הוד השרון' }, // Hod HaSharon
  { lat: [31.9, 32.0], lng: [34.8, 34.9], name: 'נס ציונה' }, // Ness Ziona
];

/**
 * Convert latitude/longitude to Israeli city name
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string|null} City name in Hebrew, or null if not found
 */
function coordinatesToCity(lat, lng) {
  if (!lat || !lng) return null;

  // Find city that contains these coordinates
  for (const city of ISRAELI_CITIES) {
    const [latMin, latMax] = city.lat;
    const [lngMin, lngMax] = city.lng;
    
    if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
      return city.name;
    }
  }

  // If not found in major cities, return null (will use online prices)
  return null;
}

/**
 * Format address with comma separator if it contains a city name
 * CHP prefers addresses in format "street, city" (e.g., "יוסף פלדמן, נס ציונה")
 * @param {string} address - Address string
 * @returns {string} Formatted address with comma if city detected
 */
function formatAddressWithComma(address) {
  if (!address || !address.trim()) return address;
  
  const trimmed = address.trim();
  
  // If already has comma, return as-is
  if (trimmed.includes(',')) {
    return trimmed;
  }
  
  // Check if address ends with a known city name
  // Try to match city names (check longer names first to avoid partial matches)
  const cityNames = ISRAELI_CITIES.map(c => c.name).sort((a, b) => b.length - a.length);
  
  for (const cityName of cityNames) {
    // Check if address ends with the city name (with or without space)
    if (trimmed.endsWith(cityName)) {
      // Extract the part before the city
      const beforeCity = trimmed.slice(0, trimmed.length - cityName.length).trim();
      if (beforeCity) {
        // Format as "street, city"
        return `${beforeCity}, ${cityName}`;
      }
      // If address is just the city name, return as-is
      return trimmed;
    }
  }
  
  // No city detected, return as-is
  return trimmed;
}

/**
 * Get location options for CHP API
 * Supports full addresses like chp.co.il (e.g., "רחוב דיזנגוף 50, תל אביב" or just "תל אביב")
 * @param {Object} options - Location options
 * @param {string} options.address - Full address (Hebrew) - preferred format like chp.co.il
 * @param {string} options.city - City name (Hebrew) - for backwards compatibility
 * @param {string} options.street - Street name (Hebrew) - for backwards compatibility
 * @param {number} options.lat - Latitude
 * @param {number} options.lng - Longitude
 * @returns {Object} Location options for CHP
 */
function getCHPLocationOptions(options = {}) {
  const { address, city, street, lat, lng } = options;
  
  console.log('getCHPLocationOptions received:', { address, city, street, lat, lng });

  // Priority 1: Full address (like chp.co.il accepts)
  // Format with comma if city name detected (e.g., "יוסף פלדמן נס ציונה" -> "יוסף פלדמן, נס ציונה")
  if (address && address.trim()) {
    const formattedAddress = formatAddressWithComma(address.trim());
    console.log('Returning full address option:', formattedAddress);
    // Return address in a format that CHP scraper will use
    return { address: formattedAddress };
  }

  // Priority 2: City name (backwards compatibility)
  if (city && city.trim()) {
    const trimmedCity = city.trim();
    console.log('Returning city option:', trimmedCity);
    return { city: trimmedCity };
  }

  // Priority 3: Street name (backwards compatibility)
  if (street && street.trim()) {
    const trimmedStreet = street.trim();
    console.log('Returning street option:', trimmedStreet);
    return { street: trimmedStreet };
  }

  // Priority 4: Coordinates - try to convert to city
  if (lat && lng) {
    const cityName = coordinatesToCity(lat, lng);
    if (cityName) {
      console.log('Returning city from coordinates:', cityName);
      return { city: cityName };
    }
  }

  // Default: empty (will show online prices)
  console.log('No location options, returning empty object');
  return {};
}

module.exports = {
  coordinatesToCity,
  getCHPLocationOptions,
  ISRAELI_CITIES,
};

