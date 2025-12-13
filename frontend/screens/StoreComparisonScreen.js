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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
// Location will be optional - use default if permission denied
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

  useEffect(() => {
    // Set default location immediately (Tel Aviv)
    setLocation({ latitude: 32.0853, longitude: 34.7818 });
    // Try to get real location (optional)
    requestLocationPermission();
  }, []);

  useEffect(() => {
    if (location && userToken) {
      fetchOptimizedBasket();
    }
  }, [location, userToken]);

  const requestLocationPermission = async () => {
    // Location is optional - we use default Tel Aviv location
    // Users can manually set their location if needed
    try {
      // Try to use location if available, but don't require it
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
      // Silently fail - we already have default location
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
          maxStores: 3,
        },
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      if (response.data.success) {
        setOptions(response.data.options || []);
        setSummary(response.data.summary);
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

  const renderOption = ({ item, index }) => {
    const isBest = index === 0;
    const storeCount = item.stores.length;
    const savings = summary?.bestOption?.totalPrice
      ? summary.bestOption.totalPrice - item.totalPrice
      : 0;

    return (
      <View style={[styles.optionCard, isBest && styles.bestOption]}>
        {isBest && (
          <View style={styles.bestBadge}>
            <Ionicons name="trophy" size={16} color="#fff" />
            <Text style={styles.bestBadgeText}>Best Option</Text>
          </View>
        )}

        <View style={styles.optionHeader}>
          <View style={styles.storeBadge}>
            <Ionicons
              name={storeCount === 1 ? 'storefront' : 'storefront-outline'}
              size={20}
              color="#28a745"
            />
            <Text style={styles.storeCount}>
              {storeCount} {storeCount === 1 ? 'Store' : 'Stores'}
            </Text>
          </View>
          <Text style={styles.optionType}>
            {item.type === 'single_store' ? 'Single Store' : 'Multi-Store'}
          </Text>
        </View>

        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Total Price:</Text>
          <Text style={styles.price}>
            ₪{item.totalPrice.toFixed(2)} {item.currency}
          </Text>
          {savings > 0 && index > 0 && (
            <Text style={styles.savings}>
              Save ₪{savings.toFixed(2)}
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

        <View style={styles.storesList}>
          {item.stores.map((store, idx) => (
            <View key={idx} style={styles.storeItem}>
              <Ionicons name="location" size={16} color="#666" />
              <Text style={styles.storeName}>{store.name}</Text>
              {store.chain && (
                <Text style={styles.storeChain}>({store.chain})</Text>
              )}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.detailsButton}
          onPress={() => {
            Alert.alert(
              'Option Details',
              `Stores: ${item.stores.map(s => s.name).join(', ')}\n\nItems: ${item.items.length}\nCoverage: ${item.coverage.toFixed(0)}%`,
              [{ text: 'OK' }]
            );
          }}
        >
          <Text style={styles.detailsButtonText}>View Details</Text>
          <Ionicons name="chevron-forward" size={16} color="#28a745" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>Best Shopping Options</Text>
        <TouchableOpacity onPress={onRefresh} disabled={isLoading}>
          <Ionicons
            name="refresh"
            size={24}
            color={isLoading ? '#ccc' : '#28a745'}
          />
        </TouchableOpacity>
      </View>

      {locationError && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={16} color="#ff9800" />
          <Text style={styles.warningText}>
            Using default location (Tel Aviv). Enable location for accurate results.
          </Text>
        </View>
      )}

      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>
            Found {summary.storesFound} stores • {summary.itemsTotal} items in your list
          </Text>
        </View>
      )}

      {isLoading && options.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#28a745" />
          <Text style={styles.loadingText}>Finding best options...</Text>
          <Text style={styles.loadingSubtext}>
            Analyzing prices across stores
          </Text>
        </View>
      ) : (
        <FlatList
          data={options}
          renderItem={renderOption}
          keyExtractor={(item, index) => `option-${index}`}
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
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 12,
    marginHorizontal: 15,
    marginTop: 10,
    borderRadius: 8,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#856404',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  storeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storeCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28a745',
  },
  optionType: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
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
    fontSize: 28,
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
  storesList: {
    marginBottom: 15,
  },
  storeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  storeName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  storeChain: {
    fontSize: 12,
    color: '#999',
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
  loadingSubtext: {
    marginTop: 5,
    fontSize: 14,
    color: '#999',
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
});

