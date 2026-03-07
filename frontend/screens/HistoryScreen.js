import React, { useState, useContext, useCallback } from 'react'; // 1. הוספנו useCallback
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native'; // 2. ייבאנו את ה-Hook החדש

const API_URL = 'http://10.0.2.2:5001';

export default function HistoryScreen() {
  const { userToken, logout } = useContext(AuthContext);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 3. החלפנו את 'useEffect' ב-'useFocusEffect'
  // השתמשנו גם ב-useCallback כדי למנוע לולאות מיותרות
  useFocusEffect(
    useCallback(() => {
      const fetchHistory = async () => {
        setIsLoading(true);
        try {
          const response = await axios.get(`${API_URL}/api/household/history`, {
            headers: {
              Authorization: `Bearer ${userToken}`,
            },
          });
          setHistory(response.data);
        } catch (error) {
          console.error('Error fetching history:', error.message);
          Alert.alert('Error', 'Could not fetch your history.');
        }
        setIsLoading(false);
      };

      if (userToken) {
        fetchHistory();
      }
    }, [userToken]) // ה-Hook תלוי ב-userToken
  );

  // (כל שאר הקוד: formatDate, renderHistoryItem, ו-return... זהה לחלוטין)
  
  const formatDate = (dateString) => {
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  const renderHistoryItem = ({ item }) => {
    // Get user display name or fallback to email or "Unknown User"
    const userName = item.user 
      ? (item.user.displayName || item.user.email || 'Unknown User')
      : 'Unknown User';

    let iconName = 'help';
    let color = '#333';
    let text = `${userName} ${item.action}`; 

    switch (item.action) {
      case 'ADD_ITEM':
        iconName = 'add-circle';
        color = '#28a745'; // Green
        text = `${userName} added ${item.itemDetails?.name || 'an item'}`;
        break;
      case 'REMOVE_ITEM':
        iconName = 'remove-circle';
        color = '#dc3545'; // Red
        text = `${userName} removed ${item.itemDetails?.name || 'an item'}`;
        break;
      case 'PURCHASE_ITEM':
        iconName = 'checkmark-circle';
        color = '#007bff'; // Blue
        text = `${userName} purchased ${item.itemDetails?.name || 'an item'}`;
        break;
      case 'UNDO_PURCHASE':
        iconName = 'arrow-undo-circle';
        color = '#ffc107'; // Yellow
        text = `${userName} un-purchased ${item.itemDetails?.name || 'an item'}`;
        break;
      case 'CLEAR_LIST':
        iconName = 'trash-bin';
        color = '#dc3545'; // Red
        if (item.itemDetails?.count != null) {
          text = `${userName} cleared ${item.itemDetails.count} item${item.itemDetails.count === 1 ? '' : 's'} from the list`;
        } else {
          text = `${userName} cleared the shopping list`;
        }
        break;
      default:
        text = `${userName} updated ${item.itemDetails?.name || 'an item'}`;
    }

    return (
      <View style={styles.itemContainer}>
        <Ionicons name={iconName} size={30} color={color} style={styles.icon} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemText}>{text}</Text>
          <Text style={styles.itemDate}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={history}
        renderItem={renderHistoryItem}
        keyExtractor={(item) => item._id}
        style={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No history found.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
  list: {
    width: '100%',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  icon: {
    marginRight: 15,
  },
  itemInfo: {
    flex: 1,
  },
  itemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  itemDate: {
    fontSize: 14,
    color: 'gray',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 18,
    color: 'gray',
  },
});