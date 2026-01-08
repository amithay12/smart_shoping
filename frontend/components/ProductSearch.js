import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Pressable,
  Image,
  ActivityIndicator,
  Modal,
  Keyboard,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = 'http://10.0.2.2:5001';

const DEBOUNCE_DELAY = 300; // milliseconds
const CITY_STORAGE_KEY = '@smart_shopping:last_city';

// Conditionally import expo-location (optional - requires native module)
let Location = null;
try {
  Location = require('expo-location');
} catch (error) {
  console.log('expo-location not available:', error.message);
}

export default function ProductSearch({ visible, onClose, onProductSelected }) {
  // Debug: Log when component receives props
  useEffect(() => {
    console.log('ProductSearch - onClose prop:', typeof onClose, !!onClose);
  }, [onClose]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [city, setCity] = useState('');
  const [locationParams, setLocationParams] = useState({});
  const searchTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Load saved city when component mounts or modal opens
  useEffect(() => {
    if (visible) {
      // Load saved city from storage
      loadSavedCity();
      // Focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      // Don't clear city - keep it persistent
      // Try to get user location
      requestLocationPermission();
    } else {
      // Clear search when modal closes (but keep city)
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    }
  }, [visible]);

  // Load saved city from AsyncStorage
  const loadSavedCity = async () => {
    try {
      const savedCity = await AsyncStorage.getItem(CITY_STORAGE_KEY);
      if (savedCity) {
        setCity(savedCity);
      }
    } catch (error) {
      console.log('Error loading saved city:', error.message);
    }
  };

  // Save city to AsyncStorage whenever it changes
  useEffect(() => {
    if (city && city.trim()) {
      AsyncStorage.setItem(CITY_STORAGE_KEY, city.trim()).catch(error => {
        console.log('Error saving city:', error.message);
      });
    }
  }, [city]);

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

    // Don't search if city is not provided (mandatory)
    if (!city || !city.trim()) {
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
  }, [searchQuery, city]);

  const performSearch = async (query) => {
    // Validate that city is provided (mandatory)
    if (!city || !city.trim()) {
      setIsSearching(false);
      Alert.alert(
        'City Required',
        'Please enter a city name to search for products with local store prices.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsSearching(true);
      
      // Build search params with location (city is now mandatory)
      const params = { 
        q: query, 
        limit: 20,
        city: city.trim(), // City is always included
      };
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

  const handleClose = () => {
    console.log('=== handleClose called ===');
    Keyboard.dismiss();
    console.log('onClose type:', typeof onClose, 'value:', !!onClose);
    if (onClose && typeof onClose === 'function') {
      console.log('Calling onClose from handleClose');
      try {
        onClose();
        console.log('onClose executed successfully');
      } catch (error) {
        console.error('Error calling onClose:', error);
      }
    } else {
      console.error('onClose is not defined or not a function!');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable 
            onPress={() => {
              console.log('Back button pressed - calling handleClose');
              handleClose();
            }}
            onPressIn={() => {
              console.log('Back button press started');
            }}
            onLongPress={() => {
              console.log('Back button long press');
            }}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed
            ]}
            hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}
          >
            <View style={styles.backButtonContent}>
              <Ionicons name="arrow-back" size={28} color="#333" />
            </View>
          </Pressable>
          <Text style={styles.headerTitle}>Search Products</Text>
          <View style={styles.backButtonPlaceholder} />
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

        {/* City Input - Mandatory */}
        <View style={styles.cityContainer}>
          <Ionicons name="location" size={20} color={city && city.trim() ? "#28a745" : "#dc3545"} style={styles.locationIcon} />
          <TextInput
            style={[
              styles.cityInput,
              !city || !city.trim() ? styles.cityInputRequired : null
            ]}
            placeholder="Enter city (required) - e.g., תל אביב, ירושלים"
            placeholderTextColor="#999"
            value={city}
            onChangeText={(text) => {
              setCity(text);
              // Save to storage when user types
              if (text && text.trim()) {
                AsyncStorage.setItem(CITY_STORAGE_KEY, text.trim()).catch(err => {
                  console.log('Error saving city:', err.message);
                });
              }
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {city && city.trim() && (
            <TouchableOpacity
              onPress={() => {
                setCity('');
                AsyncStorage.removeItem(CITY_STORAGE_KEY).catch(err => {
                  console.log('Error clearing city:', err.message);
                });
              }}
              style={styles.clearCityButton}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        {!city || !city.trim() ? (
          <View style={styles.cityWarningContainer}>
            <Ionicons name="information-circle" size={16} color="#dc3545" />
            <Text style={styles.cityWarningText}>
              City is required to search for products with local store prices
            </Text>
          </View>
        ) : null}

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
            {(!city || !city.trim()) && (
              <View style={styles.cityReminderContainer}>
                <Ionicons name="alert-circle" size={20} color="#ffc107" />
                <Text style={styles.cityReminderText}>
                  Don't forget to enter your city above
                </Text>
              </View>
            )}
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
  backButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 9999,
    elevation: 10,
  },
  backButtonContent: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    opacity: 0.6,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 25,
  },
  backButtonPlaceholder: {
    width: 44,
    height: 44,
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
  cityInputRequired: {
    borderWidth: 1,
    borderColor: '#dc3545',
  },
  cityWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff3cd',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cityWarningText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#856404',
  },
  cityReminderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
  },
  cityReminderText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#856404',
  },
  clearCityButton: {
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

