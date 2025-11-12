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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';

const API_URL = 'http://10.0.2.2:5001';

export default function ShoppingListScreen() {
  // We get the userToken from our "global brain"
  const { userInfo, userToken, logout } = useContext(AuthContext);

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // This 'useEffect' hook will run when the screen loads
  // AND any time the 'userToken' value changes.
  useEffect(() => {
    const fetchShoppingList = async () => {
      setIsLoading(true);
      try {
        const response = await axios.get(`${API_URL}/api/list`, {
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        });
        // Set the items from our API response
        setItems(response.data.items);
      } catch (error) {
        // This is the error we were seeing!
        console.error('Error fetching list:', error.message);
        Alert.alert('Error', 'Could not fetch your shopping list.');
      }
      setIsLoading(false);
    };

    // --- THIS IS THE FIX! ---
    // We add this 'if' statement (the "guard clause").
    // We tell the app: "Only run this function IF
    // the userToken is NOT null."
    if (userToken) {
      fetchShoppingList();
    }
    // -----------------------
  }, [userToken]); // We run this effect *every time* the userToken changes

  // This function renders each item in the list
  const renderItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <Text
        style={[
          styles.itemName,
          item.purchased && styles.itemPurchased,
        ]}
      >
        {item.name}
      </Text>
      <Text style={styles.itemQuantity}>qty: {item.quantity}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header with Title and Logout button */}
      <View style={styles.header}>
        <Text style={styles.title}>My Shopping List</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Welcome, {userInfo?.email}!</Text>

      {/* Show a loading spinner OR the list */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#000" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item._id} // Use the _id from MongoDB
          style={styles.list}
          // Show this message if the list is empty
          ListEmptyComponent={
            <Text style={styles.emptyText}>Your list is empty. Add an item!</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

// All styles are 100% the same as before
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
});