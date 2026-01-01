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
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';

const API_URL = 'http://10.0.2.2:5001';

export default function StoreComparisonScreen() {
  const { userToken } = useContext(AuthContext);

  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [productPriceComparison, setProductPriceComparison] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [physicalOptions, setPhysicalOptions] = useState([]);
  const [onlineOptions, setOnlineOptions] = useState([]);

  useEffect(() => {
    setLocation({ latitude: 32.0853, longitude: 34.7818 });
    requestLocationPermission();
  }, []);

  useEffect(() => {
    if (location && userToken) {
      fetchOptimizedBasket();
    }
  }, [location, userToken]);

  const requestLocationPermission = async () => {
    try {
      const Location = await import('expo-location').catch(() => null);
      if (Location) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          setLocationError(null);
        }
      }
    } catch (error) {
      console.log('Location not available, using default');
    }
  };

  const fetchOptimizedBasket = async () => {
    if (!location || !userToken) return;

    setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/basket/optimize`, {
        params: {
          lat: location.latitude,
          lng: location.longitude,
          maxDistance: 50,
          maxStores: 1, // Only single stores
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
      if (error.response?.status === 404) {
        Alert.alert(
          'No Options Found',
          'Make sure you have products linked to your shopping list items and prices added to stores.'
        );
      } else {
        Alert.alert('Error', 'Could not fetch optimized basket options');
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

  const showProductDetails = (option) => {
    setSelectedOption(option);
    setShowDetailsModal(true);
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
          style={styles.detailsButton}
          onPress={() => showProductDetails(item)}
        >
          <Text style={styles.detailsButtonText}>View Product Prices</Text>
          <Ionicons name="chevron-forward" size={16} color="#28a745" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderProductPriceRow = (productId, productName) => {
    if (!productPriceComparison || !productPriceComparison[productId]) {
      return null;
    }

    const prices = productPriceComparison[productId];
    const storeIds = Object.keys(prices);
    
    if (storeIds.length === 0) return null;

    // Find cheapest and most expensive
    const priceValues = storeIds.map(sid => prices[sid].price);
    const cheapest = Math.min(...priceValues);
    const mostExpensive = Math.max(...priceValues);

    return (
      <View key={productId} style={styles.productPriceRow}>
        <Text style={styles.productName}>{productName}</Text>
        <View style={styles.priceComparisonRow}>
          {options.map((option, idx) => {
            const storeId = option.stores[0]._id.toString();
            const priceInfo = prices[storeId];
            
            if (!priceInfo) {
              return (
                <View key={idx} style={styles.priceCell}>
                  <Text style={styles.priceUnavailable}>—</Text>
                </View>
              );
            }

            const isCheapest = priceInfo.price === cheapest && cheapest !== mostExpensive;
            const isExpensive = priceInfo.price === mostExpensive && cheapest !== mostExpensive;

            return (
              <View key={idx} style={styles.priceCell}>
                <Text style={[
                  styles.priceValue,
                  isCheapest && styles.priceCheapest,
                  isExpensive && styles.priceExpensive,
                ]}>
                  ₪{priceInfo.price.toFixed(2)}
                </Text>
                {isCheapest && (
                  <Ionicons name="arrow-down" size={12} color="#28a745" />
                )}
                {isExpensive && (
                  <Ionicons name="arrow-up" size={12} color="#ff5722" />
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>Store Comparison</Text>
        <TouchableOpacity onPress={onRefresh} disabled={isLoading}>
          <Ionicons
            name="refresh"
            size={24}
            color={isLoading ? '#ccc' : '#28a745'}
          />
        </TouchableOpacity>
      </View>

      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>
            Comparing {summary.storesFound} stores • {summary.itemsTotal} items
          </Text>
        </View>
      )}

      {isLoading && options.length === 0 ? (
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

      {/* Product Price Details Modal */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Product Prices Comparison</Text>
            <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          {selectedOption && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.storeHeaderRow}>
                <Text style={styles.storeHeaderLabel}>Product</Text>
                {options.map((opt, idx) => (
                  <Text key={idx} style={styles.storeHeaderName}>
                    {opt.stores[0].chain || opt.stores[0].name}
                  </Text>
                ))}
              </View>

              {selectedOption.items.map((item) => {
                const productId = item.product._id.toString();
                return renderProductPriceRow(productId, item.product.name || item.item.name);
              })}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                {options.map((opt, idx) => (
                  <Text key={idx} style={styles.totalValue}>
                    ₪{opt.totalPrice.toFixed(2)}
                  </Text>
                ))}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
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
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 6,
  },
  detailsButtonText: {
    color: '#28a745',
    fontSize: 14,
    fontWeight: '600',
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
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
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
  },
  modalContent: {
    flex: 1,
    padding: 15,
  },
  storeHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#28a745',
    marginBottom: 10,
  },
  storeHeaderLabel: {
    flex: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  storeHeaderName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  productPriceRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  productName: {
    flex: 2,
    fontSize: 14,
    color: '#333',
  },
  priceComparisonRow: {
    flex: 1,
    flexDirection: 'row',
  },
  priceCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  priceCheapest: {
    color: '#28a745',
    fontWeight: '600',
  },
  priceExpensive: {
    color: '#ff5722',
  },
  priceUnavailable: {
    fontSize: 14,
    color: '#ccc',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 15,
    marginTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#28a745',
  },
  totalLabel: {
    flex: 2,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
    textAlign: 'center',
  },
});
