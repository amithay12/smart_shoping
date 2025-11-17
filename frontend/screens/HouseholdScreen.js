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

export default function HouseholdScreen() {
  const { userToken, logout } = useContext(AuthContext); 
  const [household, setHousehold] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // 3. החלפנו את 'useEffect' ב-'useFocusEffect'
  useFocusEffect(
    useCallback(() => {
      const fetchHouseholdDetails = async () => {
        setIsLoading(true);
        try {
          const response = await axios.get(`${API_URL}/api/household`, {
            headers: {
              Authorization: `Bearer ${userToken}`,
            },
          });
          setHousehold(response.data); 
        } catch (error) {
          console.error('Error fetching household details:', error.message);
          Alert.alert('Error', 'Could not fetch your household details.');
        }
        setIsLoading(false);
      };

      if (userToken) {
        fetchHouseholdDetails();
      }
    }, [userToken]) // ה-Hook תלוי ב-userToken
  );

  // (כל שאר הקוד: renderMember, if (isLoading), ו-return... זהה לחלוטין)

  const renderMember = ({ item }) => (
    <View style={styles.memberContainer}>
      <Ionicons name="person-circle-outline" size={40} color="#333" />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{item.displayName}</Text>
        <Text style={styles.memberEmail}>{item.email}</Text>
      </View>
    </View>
  );

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
        <Text style={styles.title}>My Household</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inviteContainer}>
        <Text style={styles.inviteTitle}>Household Name:</Text>
        <Text style={styles.householdName}>{household?.name}</Text>
        <Text style={styles.inviteTitle}>Invite Code:</Text>
        <Text style={styles.inviteCode}>{household?._id}</Text>
        <Text style={styles.inviteInfo}>
          Share this code with others to let them join your household.
        </Text>
      </View>

      <Text style={styles.membersTitle}>Members:</Text>
      <FlatList
        data={household?.members}
        renderItem={renderMember}
        keyExtractor={(item) => item._id}
        style={styles.list}
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
  inviteContainer: {
    backgroundColor: '#fff',
    padding: 20,
    margin: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  inviteTitle: {
    fontSize: 16,
    color: 'gray',
  },
  householdName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  inviteCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#28a745', // Green
    textAlign: 'center',
    padding: 10,
    backgroundColor: '#f2f2f2',
    borderRadius: 5,
    marginTop: 5,
  },
  inviteInfo: {
    fontSize: 14,
    color: 'gray',
    textAlign: 'center',
    marginTop: 10,
  },
  membersTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  list: {
    width: '100%',
  },
  memberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberInfo: {
    marginLeft: 15,
  },
  memberName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
  },
  memberEmail: {
    fontSize: 14,
    color: 'gray',
  },
});