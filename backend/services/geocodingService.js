/**
 * Geocoding Service
 * Uses OpenStreetMap Nominatim API to geocode store addresses to GPS coordinates
 * Free, no API key required, but requires proper usage (max 1 request per second)
 */

const axios = require('axios');

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const REQUEST_DELAY = 1000; // 1 second delay between requests (Nominatim requirement)

// Cache to avoid repeated geocoding requests
const geocodeCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (store locations don't change often)

// Queue for rate limiting
let lastRequestTime = 0;
const MAX_CACHE_SIZE = 1000; // Limit cache size

/**
 * Geocode a store address to GPS coordinates
 * @param {string} storeName - Store name (e.g., "נס ציונה הפטיש")
 * @param {string} chainName - Chain name (e.g., "סופר ברקת")
 * @param {string} city - City name in Hebrew (e.g., "נס ציונה")
 * @returns {Promise<Object|null>} { lat: number, lng: number } or null if not found
 */
async function geocodeStore(storeName, chainName, city) {
  try {
    // Normalize inputs for cache key
    const normalizedStoreName = (storeName || '').trim().toLowerCase();
    const normalizedChainName = (chainName || '').trim().toLowerCase();
    const normalizedCity = (city || '').trim().toLowerCase();
    
    // Create cache key
    const cacheKey = `${normalizedStoreName}|${normalizedChainName}|${normalizedCity}`;
    
    // Check cache
    const cached = geocodeCache.get(cacheKey);
    if (cached && cached.coordinates && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[Geocoding] ✅ Cache hit for: ${storeName}, ${city} -> ${cached.coordinates.lat}, ${cached.coordinates.lng}`);
      return cached.coordinates;
    }
    
    // Clean old cache entries if cache is too large
    if (geocodeCache.size > MAX_CACHE_SIZE) {
      const now = Date.now();
      for (const [key, value] of geocodeCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          geocodeCache.delete(key);
        }
      }
      // If still too large, remove oldest entries
      if (geocodeCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(geocodeCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toDelete = entries.slice(0, geocodeCache.size - MAX_CACHE_SIZE + 100);
        toDelete.forEach(([key]) => geocodeCache.delete(key));
      }
    }

    // Build search query - try different combinations, from most specific to least
    const queries = [];
    
    // Query 1: Full store name with city (most specific - e.g., "סופר ברקת נס ציונה הפטיש")
    if (storeName && city && storeName !== chainName) {
      queries.push(`${storeName}, ${city}, Israel`);
    }
    
    // Query 2: Chain name with "supermarket" or "סופרמרקט" + city (more specific than just chain)
    if (chainName && city && chainName !== storeName) {
      // Try with supermarket keyword in Hebrew
      queries.push(`${chainName} סופרמרקט, ${city}, Israel`);
      // Try with supermarket keyword in English
      queries.push(`${chainName} supermarket, ${city}, Israel`);
      // Try just chain + city
      queries.push(`${chainName}, ${city}, Israel`);
    }
    
    // Query 3: City + chain (less specific, but might work)
    if (city && chainName) {
      queries.push(`${city} ${chainName}, Israel`);
    }

    // Try each query until we get results
    for (const query of queries) {
      const coordinates = await geocodeWithNominatim(query);
      if (coordinates) {
        // Cache the result
        geocodeCache.set(cacheKey, {
          coordinates,
          timestamp: Date.now(),
        });
        console.log(`[Geocoding] Found coordinates for "${query}": ${coordinates.lat}, ${coordinates.lng}`);
        return coordinates;
      }
    }

    console.log(`[Geocoding] No coordinates found for: ${storeName}, ${city}`);
    return null;
  } catch (error) {
    console.error(`[Geocoding] Error geocoding store:`, error.message);
    return null;
  }
}

/**
 * Geocode using Nominatim API with rate limiting
 * @param {string} query - Address query string
 * @returns {Promise<Object|null>} { lat: number, lng: number } or null
 */
async function geocodeWithNominatim(query) {
  return new Promise((resolve) => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    const delay = Math.max(0, REQUEST_DELAY - timeSinceLastRequest);

    setTimeout(async () => {
      try {
        lastRequestTime = Date.now();

        const response = await axios.get(NOMINATIM_BASE_URL, {
          params: {
            q: query,
            format: 'json',
            limit: 5, // Get multiple results to find best match
            countrycodes: 'il', // Limit to Israel
            addressdetails: 1,
            'accept-language': 'he,en', // Prefer Hebrew, fallback to English
          },
          headers: {
            'User-Agent': 'SmartShoppingApp/1.0 (Contact: shoppingapp@example.com)', // Required by Nominatim
            'Accept': 'application/json',
          },
          timeout: 8000, // Increased timeout
          validateStatus: (status) => status === 200, // Only accept 200
        });

        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter and prioritize results
          // Prefer: shop, supermarket, retail, store over city, place, administrative
          const excludedTypes = ['city', 'administrative', 'place', 'suburb', 'town'];
          const preferredTypes = ['shop', 'supermarket', 'retail', 'store', 'amenity'];
          
          let bestResult = null;
          
          // First, try to find a result with preferred types (actual stores)
          for (const result of response.data) {
            const type = result.type || '';
            const category = result.category || '';
            const class_ = result.class || '';
            const combinedType = `${type} ${category} ${class_}`.toLowerCase();
            
            // Check if it's a preferred type (actual store/shop)
            const isPreferred = preferredTypes.some(pref => combinedType.includes(pref));
            // Check if it's an excluded type (city center, administrative area)
            const isExcluded = excludedTypes.some(excl => combinedType.includes(excl));
            
            if (isPreferred && !isExcluded) {
              bestResult = result;
              console.log(`[Geocoding] ✅ Found specific store location (${combinedType}) for "${query}"`);
              break;
            }
          }
          
          // If no preferred type found, take first result that's not excluded
          if (!bestResult) {
            for (const result of response.data) {
              const type = result.type || '';
              const category = result.category || '';
              const class_ = result.class || '';
              const combinedType = `${type} ${category} ${class_}`.toLowerCase();
              
              const isExcluded = excludedTypes.some(excl => combinedType.includes(excl));
              if (!isExcluded) {
                bestResult = result;
                console.log(`[Geocoding] ⚠️ Using general location (${combinedType}) for "${query}" - not ideal but better than city center`);
                break;
              }
            }
          }
          
          // If still no result, reject it (don't use city centers)
          if (!bestResult) {
            console.warn(`[Geocoding] ⚠️ Rejecting result for "${query}" - only city/administrative centers found, not actual store locations`);
            resolve(null);
            return;
          }
          
          const lat = parseFloat(bestResult.lat);
          const lng = parseFloat(bestResult.lon);
          
          // Validate coordinates
          if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            resolve({
              lat: lat,
              lng: lng,
            });
          } else {
            console.warn(`[Geocoding] Invalid coordinates from Nominatim: ${lat}, ${lng}`);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      } catch (error) {
        // Don't log full error to avoid spam, just a brief message
        if (error.response) {
          console.warn(`[Geocoding] Nominatim API error (${error.response.status}) for "${query}"`);
        } else if (error.request) {
          console.warn(`[Geocoding] Nominatim network error for "${query}"`);
        } else {
          console.warn(`[Geocoding] Nominatim error for "${query}": ${error.message}`);
        }
        resolve(null);
      }
    }, delay);
  });
}

/**
 * Batch geocode multiple stores (with proper rate limiting)
 * @param {Array<Object>} stores - Array of { storeName, chainName, city }
 * @returns {Promise<Array<Object>>} Array of { storeName, chainName, city, coordinates }
 */
async function batchGeocodeStores(stores) {
  const results = [];
  
  for (const store of stores) {
    const coordinates = await geocodeStore(
      store.storeName,
      store.chainName,
      store.city
    );
    results.push({
      ...store,
      coordinates,
    });
  }
  
  return results;
}

/**
 * Geocode a city name to GPS coordinates
 * @param {string} cityName - City name (e.g., "תל אביב", "ירושלים")
 * @returns {Promise<Object|null>} { lat: number, lng: number } or null if not found
 */
async function geocodeCity(cityName) {
  try {
    if (!cityName || !cityName.trim()) {
      return null;
    }

    const normalizedCity = cityName.trim().toLowerCase();
    const cacheKey = `city:${normalizedCity}`;

    // Check cache
    const cached = geocodeCache.get(cacheKey);
    if (cached && cached.coordinates && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[Geocoding] ✅ Cache hit for city: ${cityName} -> ${cached.coordinates.lat}, ${cached.coordinates.lng}`);
      return cached.coordinates;
    }

    // Build query for city geocoding
    const query = `${cityName.trim()}, Israel`;

    // Use a specialized geocoding function for cities that accepts city results
    const coordinates = await geocodeCityWithNominatim(query);
    if (coordinates) {
      // Cache the result
      geocodeCache.set(cacheKey, {
        coordinates,
        timestamp: Date.now(),
      });
      console.log(`[Geocoding] Found coordinates for city "${cityName}": ${coordinates.lat}, ${coordinates.lng}`);
      return coordinates;
    }

    console.log(`[Geocoding] No coordinates found for city: ${cityName}`);
    return null;
  } catch (error) {
    console.error(`[Geocoding] Error geocoding city:`, error.message);
    return null;
  }
}

/**
 * Geocode city using Nominatim API (accepts city/administrative results)
 * @param {string} query - City query string
 * @returns {Promise<Object|null>} { lat: number, lng: number } or null
 */
async function geocodeCityWithNominatim(query) {
  return new Promise((resolve) => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    const delay = Math.max(0, REQUEST_DELAY - timeSinceLastRequest);

    setTimeout(async () => {
      try {
        lastRequestTime = Date.now();

        const response = await axios.get(NOMINATIM_BASE_URL, {
          params: {
            q: query,
            format: 'json',
            limit: 5,
            countrycodes: 'il',
            addressdetails: 1,
            'accept-language': 'he,en',
          },
          headers: {
            'User-Agent': 'SmartShoppingApp/1.0 (Contact: shoppingapp@example.com)',
            'Accept': 'application/json',
          },
          timeout: 8000,
          validateStatus: (status) => status === 200,
        });

        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // For cities, we accept city, administrative, place results
          // Prefer more specific results (city over administrative)
          const preferredTypes = ['city', 'town', 'administrative'];
          
          let bestResult = null;
          
          // Find the most specific city result
          for (const result of response.data) {
            const type = (result.type || '').toLowerCase();
            const category = (result.category || '').toLowerCase();
            const class_ = (result.class || '').toLowerCase();
            const combinedType = `${type} ${category} ${class_}`.toLowerCase();
            
            // Prefer city/town over administrative
            if (combinedType.includes('city') || combinedType.includes('town')) {
              bestResult = result;
              console.log(`[Geocoding] ✅ Found city location (${combinedType}) for "${query}"`);
              break;
            }
          }
          
          // If no city/town found, use first administrative result
          if (!bestResult) {
            for (const result of response.data) {
              const type = (result.type || '').toLowerCase();
              const category = (result.category || '').toLowerCase();
              const class_ = (result.class || '').toLowerCase();
              const combinedType = `${type} ${category} ${class_}`.toLowerCase();
              
              if (combinedType.includes('administrative')) {
                bestResult = result;
                console.log(`[Geocoding] ⚠️ Using administrative location (${combinedType}) for "${query}"`);
                break;
              }
            }
          }
          
          // If still no result, use first result
          if (!bestResult && response.data.length > 0) {
            bestResult = response.data[0];
            console.log(`[Geocoding] ⚠️ Using first result for "${query}"`);
          }
          
          if (bestResult) {
            const lat = parseFloat(bestResult.lat);
            const lng = parseFloat(bestResult.lon);
            
            // Validate coordinates
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              resolve({
                lat: lat,
                lng: lng,
              });
              return;
            }
          }
        }
        
        resolve(null);
      } catch (error) {
        if (error.response) {
          console.warn(`[Geocoding] Nominatim API error (${error.response.status}) for "${query}"`);
        } else if (error.request) {
          console.warn(`[Geocoding] Nominatim network error for "${query}"`);
        } else {
          console.warn(`[Geocoding] Nominatim error for "${query}": ${error.message}`);
        }
        resolve(null);
      }
    }, delay);
  });
}

module.exports = {
  geocodeStore,
  batchGeocodeStores,
  geocodeCity,
};

