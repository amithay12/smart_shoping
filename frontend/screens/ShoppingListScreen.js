import React, { useState, useContext, useCallback, useEffect } from 'react';
import { emit } from '../utils/eventBus';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native'; // <--- ADDED THIS IMPORT
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import BarcodeScanner from '../components/BarcodeScanner';
import ProductSearch from '../components/ProductSearch';

const API_URL = 'http://10.0.2.2:5001';

export default function ShoppingListScreen() {
  const { userInfo, userToken, logout } = useContext(AuthContext);

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showSearch, setShowSearch] = useState(false);


  // --- CHANGED: Replaced useEffect with useFocusEffect ---
  // This ensures the list refreshes every time you switch back to this tab.
  useFocusEffect(
    useCallback(() => {
      let isActive = true; // Use a flag to prevent setting state if screen unmounts

      const fetchShoppingList = async () => {
        // Only show loading spinner if list is empty (for smoother UX)
        if (items.length === 0) setIsLoading(true);
        
        try {
          const response = await axios.get(`${API_URL}/api/list`, {
            headers: { Authorization: `Bearer ${userToken}` },
          });
          
          if (isActive) {
            setItems(response.data.items);
          }
        } catch (error) {
          console.error('Error fetching list:', error.message);
          if (error.response?.status === 401) {
            logout();
          }
        }
        
        if (isActive) setIsLoading(false);
      };

      if (userToken) {
        fetchShoppingList();
      }

      // Cleanup function to avoid memory leaks
      return () => {
        isActive = false;
      };
    }, [userToken]) // Removed 'items.length' dependency to avoid loops
  );
  // --- END OF CHANGE ---

  // This handles Toggling Purchase
  const handleTogglePurchase = async (item) => {
    try {
      const response = await axios.put(
        `${API_URL}/api/list/item/${item._id}`, 
        {
          isPurchased: !item.isPurchased, 
          name: item.name,
          quantity: item.quantity,
        },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      setItems(response.data.items);
      // Emit change event so other screens (Recommendations) refresh automatically
      emit('shoppingList:changed');
    } catch (error) {
      console.error('Error updating item:', error.message);
      Alert.alert('Error', 'Could not update the item.');
    }
  };

  // This handles Deleting Item
  const handleDeleteItem = async (item) => {
    try {
      const response = await axios.delete(
        `${API_URL}/api/list/item/${item._id}`, 
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      setItems(response.data.items);
      // Emit change event so other screens (Recommendations) refresh automatically
      emit('shoppingList:changed');
    } catch (error) {
      console.error('Error deleting item:', error.message);
      Alert.alert('Error', 'Could not delete the item.');
    }
  };

  const handleClearListConfirmed = async () => {
    try {
      setIsLoading(true);
      const response = await axios.delete(`${API_URL}/api/list`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      setItems(response.data.items || []);
      emit('shoppingList:changed');
    } catch (error) {
      console.error('Error clearing list:', error.message || error);
      Alert.alert('Error', 'Could not clear your shopping list.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearList = () => {
    if (!items || items.length === 0) {
      Alert.alert('Nothing to clear', 'Your shopping list is already empty.');
      return;
    }

    Alert.alert(
      'Clear entire list',
      'Are you sure you want to delete all items from your shopping list?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: handleClearListConfirmed,
        },
      ]
    );
  };

  // This shows the Pop-Up Menu
  const handleItemOptions = (item) => {
    const purchaseText = item.isPurchased ? 'Mark as NOT Purchased' : 'Mark as Purchased';

    Alert.alert(
      item.name, 
      'What would you like to do?', 
      [
        {
          text: purchaseText,
          onPress: () => handleTogglePurchase(item),
        },
        {
          text: 'Delete Item',
          onPress: () => handleDeleteItem(item),
          style: 'destructive', 
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onLongPress={() => handleItemOptions(item)}>
      <View style={styles.itemContainer}>
        <Text
          style={[
            styles.itemName,
            item.isPurchased && styles.itemPurchased, 
          ]}
        >
          {item.name}
        </Text>
        <Text style={styles.itemQuantity}>qty: {item.quantity}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>My Shopping List</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.scanButton, styles.searchButton, { marginLeft: 10 }]}
            onPress={() => setShowSearch(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.scanButtonText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanButton, { marginLeft: 10 }]}
            onPress={() => setShowScanner(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.scanButtonText}>📷 Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={logout}
            style={{ marginLeft: 10 }}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutButton}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.subtitle}>Welcome, {userInfo?.email}!</Text>

      <View style={styles.clearListContainer}>
        <TouchableOpacity
          style={styles.clearListButton}
          onPress={handleClearList}
          activeOpacity={0.7}
        >
          <Text style={styles.clearListButtonText}>Clear List</Text>
        </TouchableOpacity>
      </View>

      {isLoading && items.length === 0 ? (
        <ActivityIndicator size="large" color="#000" style={styles.loader} />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item._id} 
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Your list is empty. Add an item!</Text>
          }
        />
      )}

      {/* Product Search */}
      <ProductSearch
        visible={showSearch}
        onClose={() => {
          setShowSearch(false);
        }}
          onProductSelected={async (product, locationParams = {}) => {
            try {
              const response = await axios.post(
                `${API_URL}/api/list/item`,
                {
                  name: product.name,
                  quantity: '1',
                  productId: product._id || null,
                  barcode: product.barcode || null,
                  city: locationParams.city,
                  lat: locationParams.lat,
                  lng: locationParams.lng,
                },
                { headers: { Authorization: `Bearer ${userToken}` } }
              );
              setItems(response.data.items);
              emit('shoppingList:changed');
              setShowSearch(false);
              // Use setTimeout to ensure modal is closed before showing alert
              setTimeout(() => {
                Alert.alert('Success!', `${product.name} added to your list.`);
              }, 300);
            } catch (error) {
              console.error('Error adding product:', error);
              setShowSearch(false);
              setTimeout(() => {
                Alert.alert('Error', 'Could not add product to list.');
              }, 300);
            }
          }}
      />

      {/* Barcode Scanner */}
      <BarcodeScanner
        visible={showScanner}
          onClose={() => {
            console.log('Closing scanner modal');
            setShowScanner(false);
          }}
          onProductFound={async (product, locationParams = {}) => {
            setShowScanner(false);
            try {
              const response = await axios.post(
                `${API_URL}/api/list/item`,
                {
                  name: product.name,
                  quantity: '1',
                  productId: product._id,
                  barcode: product.barcode,
                  city: locationParams?.city,
                  lat: locationParams?.lat,
                  lng: locationParams?.lng,
                },
                { headers: { Authorization: `Bearer ${userToken}` } }
              );
              setItems(response.data.items);
              emit('shoppingList:changed');
              setTimeout(() => {
                Alert.alert('Success!', `${product.name} added to your list.`);
              }, 300);
            } catch (error) {
              console.error('Error adding product:', error);
              setTimeout(() => {
                Alert.alert('Error', 'Could not add product to list.');
              }, 300);
            }
          }}
          userToken={userToken}
      />

      {/* Add Item Button at Bottom */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity 
          style={styles.bottomAddButton} 
          onPress={() => setShowSearch(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.bottomAddButtonText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    flexWrap: 'nowrap',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  searchButton: {
    backgroundColor: '#007bff',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    flexShrink: 1,
  },
  logoutButton: {
    fontSize: 16,
    color: '#dc3545',
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 16,
    color: 'gray',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  clearListContainer: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  clearListButton: {
    backgroundColor: '#dc3545',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearListButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    width: '100%',
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {
    fontSize: 18,
    color: '#333',
  },
  itemPurchased: {
    textDecorationLine: 'line-through', 
    color: '#aaa', 
  },
  itemQuantity: {
    fontSize: 16,
    color: 'gray',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 18,
    color: 'gray',
  },
  bottomButtonContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  bottomAddButton: {
    backgroundColor: '#28a745',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomAddButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});