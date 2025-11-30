import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';

const API_URL = 'http://10.0.2.2:5001';

export default function ShoppingListScreen() {
  const { userInfo, userToken, logout } = useContext(AuthContext);

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  // This hook fetches the list when the screen loads
  useEffect(() => {
    const fetchShoppingList = async () => {
      setIsLoading(true);
      try {
        const response = await axios.get(`${API_URL}/api/list`, {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        setItems(response.data.items);
      } catch (error) {
        console.error('Error fetching list:', error.message);
        Alert.alert('Error', 'Could not fetch your shopping list.');
      }
      setIsLoading(false);
    };

    if (userToken) {
      fetchShoppingList();
    }
  }, [userToken]);

  // This adds a new item
  const handleAddItem = async () => {
    if (newItemName.trim() === '') {
      return Alert.alert('Error', 'Please enter an item name.');
    }
    try {
      const response = await axios.post(
        `${API_URL}/api/list/item`,
        { name: newItemName, quantity: '1' },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      setItems(response.data.items); 
      setNewItemName('');
      Keyboard.dismiss();
    } catch (error) {
      console.error('Error adding item:', error.message);
      Alert.alert('Error', 'Could not add the item.');
    }
  };

  // This handles Toggling Purchase (Calls our fixed PUT API)
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
    } catch (error) {
      console.error('Error updating item:', error.message);
      Alert.alert('Error', 'Could not update the item.');
    }
  };

  // This handles Deleting Item (Calls our fixed DELETE API)
  const handleDeleteItem = async (item) => {
    try {
      const response = await axios.delete(
        `${API_URL}/api/list/item/${item._id}`, 
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      setItems(response.data.items); 
    } catch (error) {
      console.error('Error deleting item:', error.message);
      Alert.alert('Error', 'Could not delete the item.');
    }
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

  // --- THIS IS THE FIX! ---
  // We are updating renderItem to use the correct property name
  const renderItem = ({ item }) => (
    <TouchableOpacity onLongPress={() => handleItemOptions(item)}>
      <View style={styles.itemContainer}>
        <Text
          style={[
            styles.itemName,
            // THE BUG WAS HERE: It should be item.isPurchased
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>My Shopping List</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Welcome, {userInfo?.email}!</Text>

      {isLoading ? (
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

      {/* Add Item Form */}
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="e.g., Milk, Eggs, Bread..."
          value={newItemName}
          onChangeText={setNewItemName}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --- STYLES (with the .itemPurchased fix) ---
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
    marginBottom: 20,
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
    textDecorationLine: 'line-through', // This adds the line!
    color: '#aaa', // This makes the text gray
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
  formContainer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  addButton: {
    width: 60,
    height: 50,
    backgroundColor: '#28a745',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
}); 