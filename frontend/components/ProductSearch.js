import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = 'http://10.0.2.2:5001';

const DEBOUNCE_DELAY = 300; // milliseconds

// Conditionally import expo-location (optional - requires native module)
let Location = null;
try {
  Location = require('expo-location');
} catch (error) {
  console.log('expo-location not available:', error.message);
}

export default function ProductSearch({ visible, onClose, onProductSelected }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [city, setCity] = useState('');
  const [locationParams, setLocationParams] = useState({});
  const searchTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      // Focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      setCity('');
      // Try to get user location
      requestLocationPermission();
    } else {
      // Clear search when modal closes
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    }
  }, [visible]);

  const requestLocationPermission = async () => {
    if (!Location) return;
    
    try {
      // Only request permission if modal is visible and app is ready
      if (!visible) return;
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted' && visible) {
        try {
          const location = await Location.getCurrentPositionAsync({});
          if (visible) {
            setLocationParams({
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            });
          }
        } catch (locError) {
          // Location fetch failed, but that's okay - continue without it
          console.log('Could not get current location:', locError.message);
        }
      }
    } catch (error) {
      // Permission request failed, continue without location
      console.log('Location permission not available:', error.message);
    }
  };

  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't search if query is too short
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }

    // Debounce search
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery.trim());
    }, DEBOUNCE_DELAY);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const performSearch = async (query) => {
    try {
      setIsSearching(true);
      
      // Build search params with location
      const params = { q: query, limit: 20 };
      if (city && city.trim()) {
        params.city = city.trim();
      }
      if (locationParams.lat) {
        params.lat = locationParams.lat;
      }
      if (locationParams.lng) {
        params.lng = locationParams.lng;
      }
      
      const response = await axios.get(`${API_URL}/api/products/search`, {
        params,
      });

      if (response.data.success && response.data.products) {
        setSearchResults(response.data.products);
        setShowResults(true);
      } else {
        setSearchResults([]);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Search error:', error.message);
      setSearchResults([]);
      setShowResults(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleProductSelect = (product) => {
    Keyboard.dismiss();
    setShowResults(false);
    if (onProductSelected) {
      // Pass location info along with product so prices can be fetched for that location
      onProductSelected(product, {
        city: city.trim(),
        lat: locationParams.lat,
        lng: locationParams.lng,
      });
    }
    onClose();
  };

  const renderProductItem = ({ item }) => {
    const hasBarcode = item.barcode && item.barcode.trim() !== '';
    const imageUrl = item.imageUrl || (item.images && item.images[0]);

    return (
      <TouchableOpacity
        style={styles.productItem}
        onPress={() => handleProductSelect(item)}
        activeOpacity={0.7}
      >
        {/* Product Image */}
        <View style={styles.imageContainer}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.productImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="cube-outline" size={32} color="#ccc" />
            </View>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name || 'Unknown Product'}
          </Text>
          {item.brand && (
            <Text style={styles.productBrand} numberOfLines={1}>
              {item.brand}
            </Text>
          )}
          {hasBarcode && (
            <View style={styles.barcodeContainer}>
              <Ionicons name="barcode-outline" size={14} color="#666" />
              <Text style={styles.barcodeText}>{item.barcode}</Text>
            </View>
          )}
          {item.size && (
            <Text style={styles.productSize}>{item.size}</Text>
          )}
        </View>

        {/* Arrow Icon */}
        <Ionicons name="chevron-forward" size={24} color="#ccc" />
      </TouchableOpacity>
    );
  };

  // Debug logging
  useEffect(() => {
    console.log('ProductSearch visible prop:', visible);
    console.log('ProductSearch component mounted/updated');
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {
        console.log('Modal onRequestClose called');
        if (onClose) onClose();
      }}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search Products</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={24} color="#666" style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search by product name (e.g., חלב, לחם, ביצים)..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {isSearching && (
            <ActivityIndicator size="small" color="#666" style={styles.loadingIndicator} />
          )}
          {searchQuery.length > 0 && !isSearching && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowResults(false);
              }}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={24} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        {/* City Input */}
        <View style={styles.cityContainer}>
          <Ionicons name="location" size={20} color="#666" style={styles.locationIcon} />
          <TextInput
            style={styles.cityInput}
            placeholder="Enter city (e.g., תל אביב, ירושלים) - for local store prices"
            placeholderTextColor="#999"
            value={city}
            onChangeText={setCity}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {locationParams.lat && locationParams.lng && (
            <TouchableOpacity
              onPress={requestLocationPermission}
              style={styles.locationButton}
            >
              <Ionicons name="refresh" size={18} color="#007bff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Results */}
        {showResults && (
          <View style={styles.resultsContainer}>
            {isSearching ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#28a745" />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                renderItem={renderProductItem}
                keyExtractor={(item) => item._id || item.barcode || item.name || Math.random().toString()}
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  <Text style={styles.resultsHeader}>
                    Found {searchResults.length} product{searchResults.length !== 1 ? 's' : ''}
                  </Text>
                }
                ListEmptyComponent={
                  <View style={styles.centerContainer}>
                    <Ionicons name="search-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No products found</Text>
                  </View>
                }
              />
            ) : searchQuery.trim().length >= 2 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="search-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No products found</Text>
                <Text style={styles.emptySubtext}>Try a different search term</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Initial State */}
        {!showResults && searchQuery.trim().length < 2 && (
          <View style={styles.centerContainer}>
            <Ionicons name="search-outline" size={80} color="#ddd" />
            <Text style={styles.placeholderText}>
              Start typing to search for products
            </Text>
            <Text style={styles.placeholderSubtext}>
              Search by name, brand, or category
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  locationIcon: {
    marginRight: 8,
  },
  cityInput: {
    flex: 1,
    height: 36,
    fontSize: 14,
    color: '#333',
    paddingVertical: 0,
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 10,
  },
  locationButton: {
    marginLeft: 8,
    padding: 4,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#333',
    paddingVertical: 0,
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  resultsList: {
    flex: 1,
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#666',
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  imageContainer: {
    width: 60,
    height: 60,
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  productInfo: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  barcodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  barcodeText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    fontFamily: 'monospace',
  },
  productSize: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    color: '#999',
    fontWeight: '500',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#bbb',
  },
  placeholderText: {
    marginTop: 24,
    fontSize: 18,
    color: '#999',
    fontWeight: '500',
    textAlign: 'center',
  },
  placeholderSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
  },
});

