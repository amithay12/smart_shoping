import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';  
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = 'http://10.0.2.2:5001';
const CITY_STORAGE_KEY = '@smart_shopping:last_city'; // Same key as ProductSearch

export default function StoreComparisonScreen() {
  const { userToken } = useContext(AuthContext);

  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [city, setCity] = useState('');
  const [summary, setSummary] = useState(null);
  const [productPriceComparison, setProductPriceComparison] = useState(null);
  const [physicalOptions, setPhysicalOptions] = useState([]);
  const [onlineOptions, setOnlineOptions] = useState([]);
  const [selectedStoreProducts, setSelectedStoreProducts] = useState(null);

  // Load saved city when component mounts
  useEffect(() => {
    loadSavedCity();
  }, []);

  const loadSavedCity = async () => {
    try {
      const savedCity = await AsyncStorage.getItem(CITY_STORAGE_KEY);
      if (savedCity && savedCity.trim()) {
        setCity(savedCity.trim());
      }
    } catch (error) {
      console.log('Error loading saved city:', error.message);
    }
  };

  useEffect(() => {
    // Only fetch if we have a valid city and user token
    // This prevents errors when city is empty
    if (city && city.trim() && userToken) {
      // Clear previous results immediately when city changes
      setOptions([]);
      setPhysicalOptions([]);
      setOnlineOptions([]);
      setSummary(null);
      setProductPriceComparison(null);
      // Fetch new data for the new city - pass city as parameter to ensure latest value
      fetchOptimizedBasket(city.trim());
    } else if (city === '' && userToken) {
      // City is explicitly empty (not loaded yet), clear options
      setOptions([]);
      setPhysicalOptions([]);
      setOnlineOptions([]);
      setSummary(null);
      setProductPriceComparison(null);
    }
  }, [city, userToken]);

  const fetchOptimizedBasket = async (cityToUse = null) => {
    // Use parameter if provided, otherwise fall back to state (for manual refresh)
    const cityValue = cityToUse || city;
    if (!cityValue || !cityValue.trim() || !userToken) return;

    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/basket/optimize`, {
        params: {
          address: cityValue.trim(), // Send as address parameter (can be full address like chp.co.il)
          maxDistance: 20, // Reduced to 20km to show stores closer to the address
          maxStores: 1, // Only single stores
          _t: Date.now(), // Cache busting - ensures fresh data when address changes
        },
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      if (response.data.success) {
        const allOptions = response.data.options || [];
        setOptions(allOptions);
        
        // Separate physical and online stores
        const physical = allOptions.filter(opt => {
          const storeType = opt.stores[0]?.storeType || 'physical';
          return storeType === 'physical';
        });
        const online = allOptions.filter(opt => {
          const storeType = opt.stores[0]?.storeType || 'physical';
          return storeType === 'online';
        });
        
        setPhysicalOptions(physical);
        setOnlineOptions(online);
        setSummary(response.data.summary);
        setProductPriceComparison(response.data.productPriceComparison || {});
      } else {
        Alert.alert('Error', response.data.message || 'Could not optimize basket');
      }
    } catch (error) {
      console.error('Optimization error:', error);
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.message || 'Invalid city name. Please check and try again.';
        Alert.alert(
          'City Error',
          errorMessage
        );
      } else if (error.response?.status === 404) {
        Alert.alert(
          'No Options Found',
          'Make sure you have products linked to your shopping list items and prices added to stores.'
        );
      } else {
        Alert.alert('Error', error.response?.data?.message || 'Could not fetch optimized basket options');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOptimizedBasket();
    setRefreshing(false);
  };

  const renderOption = ({ item, index }) => {
    const isBest = index === 0;
    const store = item.stores[0];
    const storeType = store.storeType || 'physical';
    const isPhysical = storeType === 'physical';
    const savings = summary?.bestOption?.totalPrice && index > 0
      ? summary.bestOption.totalPrice - item.totalPrice
      : 0;

    return (
      <View style={[styles.optionCard, isBest && styles.bestOption]}>
        {isBest && (
          <View style={styles.bestBadge}>
            <Ionicons name="trophy" size={16} color="#fff" />
            <Text style={styles.bestBadgeText}>Best Price</Text>
          </View>
        )}

        <View style={styles.optionHeader}>
          <View style={styles.storeInfo}>
            <Ionicons 
              name={isPhysical ? "storefront" : "globe"} 
              size={24} 
              color={isPhysical ? "#28a745" : "#2196F3"} 
            />
            <View style={styles.storeDetails}>
              <View style={styles.storeNameRow}>
                <Text style={styles.storeName}>{store.name}</Text>
                <View style={[styles.storeTypeBadge, isPhysical ? styles.physicalBadge : styles.onlineBadge]}>
                  <Text style={styles.storeTypeText}>
                    {isPhysical ? 'Physical' : 'Online'}
                  </Text>
                </View>
              </View>
              {store.chain && (
                <Text style={styles.storeChain}>{store.chain}</Text>
              )}
              {store.distance !== null && store.distance !== undefined && (
                <Text style={styles.storeDistance}>
                  {store.distance.toFixed(1)} ק"מ
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Total Price:</Text>
          <Text style={styles.price}>
            ₪{item.totalPrice.toFixed(2)}
          </Text>
          {savings > 0 && (
            <Text style={styles.savings}>
              Save ₪{savings.toFixed(2)} vs other stores
            </Text>
          )}
        </View>

        <View style={styles.coverageContainer}>
          <View style={styles.coverageBar}>
            <View
              style={[
                styles.coverageFill,
                { width: `${item.coverage}%` },
              ]}
            />
          </View>
          <Text style={styles.coverageText}>
            {item.coverage.toFixed(0)}% Coverage ({item.itemsFound}/{item.itemsTotal} items)
          </Text>
        </View>

        <TouchableOpacity
          style={styles.viewProductsButton}
          onPress={() => setSelectedStoreProducts({ store: store, items: item.items || [] })}
          activeOpacity={0.7}
        >
          <Ionicons name="list" size={16} color="#007bff" />
          <Text style={styles.viewProductsButtonText}>View Products</Text>
        </TouchableOpacity>
      </View>
    );
  };


  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>Store Comparison</Text>
        <TouchableOpacity onPress={onRefresh} disabled={isLoading || !city || !city.trim()}>
          <Ionicons
            name="refresh"
            size={24}
            color={isLoading || !city || !city.trim() ? '#ccc' : '#28a745'}
          />
        </TouchableOpacity>
      </View>

      {/* City Input - Mandatory */}
      <View style={styles.cityContainer}>
        <Ionicons 
          name="location" 
          size={20} 
          color={city && city.trim() ? "#28a745" : "#dc3545"} 
          style={styles.locationIcon} 
        />
        <TextInput
          style={[
            styles.cityInput,
            !city || !city.trim() ? styles.cityInputRequired : null
          ]}
          placeholder="Enter address (required) - e.g., תל אביב or רחוב דיזנגוף 50, תל אביב"
          placeholderTextColor="#999"
          value={city}
          onChangeText={(text) => {
            // Update state immediately - this will trigger useEffect to fetch new data
            setCity(text);
            // Save to storage when user types
            if (text && text.trim()) {
              AsyncStorage.setItem(CITY_STORAGE_KEY, text.trim()).catch(err => {
                console.log('Error saving city:', err.message);
              });
            } else {
              AsyncStorage.removeItem(CITY_STORAGE_KEY).catch(err => {
                console.log('Error clearing city:', err.message);
              });
            }
          }}
          onSubmitEditing={() => {
            // When user presses enter/done, trigger refresh if city is valid
            if (city && city.trim() && userToken) {
              fetchOptimizedBasket(city.trim());
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
            Address is required to compare prices for stores in your area (like chp.co.il)
          </Text>
        </View>
      ) : null}

      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>
            Comparing {summary.storesFound} stores • {summary.itemsTotal} items
            {city && city.trim() && ` • ${city.trim()}`}
          </Text>
        </View>
      )}

      {!city || !city.trim() ? (
        <View style={styles.centerContainer}>
          <Ionicons name="location-outline" size={80} color="#ddd" />
          <Text style={styles.placeholderText}>
            Enter your address to compare prices (like chp.co.il)
          </Text>
          <Text style={styles.placeholderSubtext}>
            We'll show you stores and prices in your city and nearby areas
          </Text>
        </View>
      ) : isLoading && options.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#28a745" />
          <Text style={styles.loadingText}>Comparing prices...</Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...physicalOptions.map((item, idx) => ({ ...item, section: 'physical', index: idx })),
            ...onlineOptions.map((item, idx) => ({ ...item, section: 'online', index: idx })),
          ]}
          renderItem={({ item, index }) => {
            // Show section header before first physical store and before first online store
            const isFirstPhysical = item.section === 'physical' && index === 0;
            const isFirstOnline = item.section === 'online' && 
              physicalOptions.length > 0 && 
              index === physicalOptions.length;
            
            return (
              <>
                {isFirstPhysical && (
                  <View style={styles.sectionHeader}>
                    <Ionicons name="storefront" size={20} color="#28a745" />
                    <Text style={styles.sectionHeaderText}>Physical Supermarkets</Text>
                  </View>
                )}
                {isFirstOnline && (
                  <View style={styles.sectionHeader}>
                    <Ionicons name="globe" size={20} color="#2196F3" />
                    <Text style={styles.sectionHeaderText}>Online Stores</Text>
                  </View>
                )}
                {renderOption({ item, index: item.index })}
              </>
            );
          }}
          keyExtractor={(item, index) => `option-${item.section}-${item.index}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#28a745']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="storefront-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>No Options Found</Text>
              <Text style={styles.emptyText}>
                Make sure you have:{'\n'}
                • Products linked to your shopping list items{'\n'}
                • Prices added to stores{'\n'}
                • Items in your shopping list
              </Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={onRefresh}
              >
                <Text style={styles.refreshButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Products Modal */}
      <Modal
        visible={selectedStoreProducts !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedStoreProducts(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedStoreProducts?.store?.name || 'Store'} Products
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedStoreProducts(null)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedStoreProducts?.items && selectedStoreProducts.items.length > 0 ? (
                selectedStoreProducts.items.map((itemData, idx) => (
                  <View key={idx} style={styles.productItem}>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>
                        {itemData.item?.name || itemData.product?.name || 'Unknown Product'}
                      </Text>
                      {itemData.item?.quantity && (
                        <Text style={styles.productQuantity}>
                          Quantity: {itemData.item.quantity}
                        </Text>
                      )}
                    </View>
                    <View style={styles.productPriceContainer}>
                      <Text style={styles.productPrice}>
                        ₪{itemData.price?.toFixed(2) || '0.00'}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyProductsContainer}>
                  <Ionicons name="cart-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyProductsText}>No products found for this store</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryCard: {
    backgroundColor: '#e8f5e9',
    padding: 15,
    margin: 15,
    borderRadius: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#2e7d32',
    textAlign: 'center',
  },
  listContent: {
    padding: 15,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bestOption: {
    borderWidth: 2,
    borderColor: '#28a745',
  },
  bestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 15,
    gap: 6,
  },
  bestBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  optionHeader: {
    marginBottom: 15,
  },
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storeDetails: {
    flex: 1,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  storeChain: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  storeDistance: {
    fontSize: 14,
    color: '#2196F3',
    marginTop: 4,
    fontWeight: '500',
  },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  physicalBadge: {
    backgroundColor: '#e8f5e9',
  },
  onlineBadge: {
    backgroundColor: '#e3f2fd',
  },
  storeTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 5,
    marginTop: 10,
    marginBottom: 5,
    gap: 8,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  priceContainer: {
    marginBottom: 15,
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  savings: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '600',
    marginTop: 4,
  },
  coverageContainer: {
    marginBottom: 15,
  },
  coverageBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  coverageFill: {
    height: '100%',
    backgroundColor: '#28a745',
  },
  coverageText: {
    fontSize: 12,
    color: '#666',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  cityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  locationIcon: {
    marginRight: 8,
  },
  cityInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#333',
    paddingVertical: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cityInputRequired: {
    borderColor: '#dc3545',
    borderWidth: 2,
  },
  clearCityButton: {
    marginLeft: 8,
    padding: 4,
  },
  cityWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff3cd',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cityWarningText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#856404',
    flex: 1,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 20,
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  refreshButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewProductsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  viewProductsButtonText: {
    color: '#007bff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  productQuantity: {
    fontSize: 14,
    color: '#666',
  },
  productPriceContainer: {
    alignItems: 'flex-end',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
  },
  emptyProductsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyProductsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
});
