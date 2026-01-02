import React, { useState, useContext, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
  RefreshControl,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { on } from '../utils/eventBus';
import axios from 'axios';

const API_URL = 'http://10.0.2.2:5001';

export default function RecommendationsScreen() {
  const { userInfo, userToken } = useContext(AuthContext);

  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addingItemId, setAddingItemId] = useState(null);

  // Fetch on initial mount / token change
  useEffect(() => {
    if (userToken) {
      fetchRecommendations(false); // show spinner on first load
    }
  }, [userToken]);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (userToken) fetchRecommendations(true); // silent refresh
    }, [userToken])
  );

  // Listen for list changes from anywhere in the app
  useEffect(() => {
    const unsubscribe = on('shoppingList:changed', () => {
      if (userToken) fetchRecommendations(true); // silent refresh
    });
    return unsubscribe;
  }, [userToken]);

  // Refresh when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userToken) {
        fetchRecommendations(true); // silent refresh
      }
    });
    return () => sub.remove();
  }, [userToken]);

  const fetchRecommendations = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/recommendations`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      setRecommendations(response.data.recommendations || []);
    } catch (error) {
      console.error('Error fetching recommendations:', error.message);
      if (error.response?.status !== 404) {
        Alert.alert('Error', 'Could not fetch recommendations.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRecommendations(true);
    setRefreshing(false);
  };

  const handleAddToList = async (item) => {
    setAddingItemId(item.name);
    try {
      // Send productId and barcode if available for proper product linking
      await axios.post(
        `${API_URL}/api/list/item`,
        {
          name: item.name,
          quantity: item.quantity || '1',
          productId: item.productId || null,
          barcode: item.barcode || null,
        },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      // Optimistically remove it locally
      setRecommendations((prev) => prev.filter((rec) => rec.name !== item.name));
      // Pull fresh recs after the list changed
      fetchRecommendations(true);
      Alert.alert('Success!', `${item.name} added to your shopping list.`);
    } catch (error) {
      console.error('Error adding item:', error.message);
      Alert.alert('Error', 'Could not add item to list. Please try again.');
    } finally {
      setAddingItemId(null);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const renderItem = ({ item }) => (
    <View style={styles.recommendationCard}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        {item.brand && (
          <Text style={styles.brandText}>{item.brand}</Text>
        )}
        <View style={styles.metaContainer}>
          <Text style={styles.metaText}>
            Purchased {item.purchaseCount} time{item.purchaseCount > 1 ? 's' : ''}
          </Text>
          <Text style={styles.metaText}>•</Text>
          <Text style={styles.metaText}>
            Usually every {item.averageFrequencyDays} days
          </Text>
        </View>
        <Text style={styles.lastPurchaseText}>
          Last purchased: {formatDate(item.lastPurchaseDate)}
        </Text>
        <Text style={styles.reasonText}>{item.reason}</Text>
        {item.quantity && item.quantity !== '1' && (
          <Text style={styles.quantityText}>Quantity: {item.quantity}</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.addButton, addingItemId === item.name && styles.addButtonDisabled]}
        onPress={() => handleAddToList(item)}
        disabled={addingItemId === item.name}
      >
        {addingItemId === item.name ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.addButtonText}>Add</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>Smart Recommendations</Text>
        <Text style={styles.subtitle}>Based on your shopping history</Text>
      </View>

      {isLoading && recommendations.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#28a745" />
          <Text style={styles.loadingText}>Analyzing your shopping patterns...</Text>
        </View>
      ) : (
        <FlatList
          data={recommendations}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#28a745']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No recommendations yet</Text>
              <Text style={styles.emptyText}>
                Keep shopping and marking items as purchased to get personalized recommendations!
              </Text>
              <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#666' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 15, fontSize: 16, color: '#666', textAlign: 'center' },
  list: { flex: 1 },
  listContent: { padding: 15 },
  recommendationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemInfo: { flex: 1, marginRight: 12 },
  itemName: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 4 },
  brandText: { fontSize: 14, color: '#888', marginBottom: 6, fontStyle: 'italic' },
  metaContainer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 },
  metaText: { fontSize: 13, color: '#666', marginRight: 6 },
  lastPurchaseText: { fontSize: 12, color: '#999', marginTop: 4 },
  reasonText: { fontSize: 13, color: '#007bff', fontWeight: '500', marginTop: 4 },
  quantityText: { fontSize: 13, color: '#28a745', fontWeight: '500', marginTop: 4 },
  addButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#333', marginBottom: 10, textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  refreshButton: { backgroundColor: '#28a745', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  refreshButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});