import React, { useState, useContext, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  Modal,
  Keyboard,
  Share,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

// Try to import Clipboard - works with expo-clipboard or React Native
let Clipboard = null;
try {
  Clipboard = require('expo-clipboard');
} catch (e) {
  try {
    const RN = require('react-native');
    Clipboard = RN.Clipboard || RN.ClipboardAPI;
  } catch (e2) {
    console.log('Clipboard not available');
  }
}

const API_URL = 'http://10.0.2.2:5001';

export default function HouseholdScreen() {
  const { userToken, logout, setUserInfo } = useContext(AuthContext); 
  const [household, setHousehold] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      if (userToken) {
        fetchHouseholdDetails();
      }
    }, [userToken])
  );

  const handleJoinHousehold = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }

    setIsJoining(true);
    Keyboard.dismiss();
    
    try {
      const response = await axios.post(
        `${API_URL}/api/household/join`,
        { inviteCode: inviteCode.trim() },
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
          },
        }
      );

      setHousehold(response.data.household);
      setShowJoinModal(false);
      setInviteCode('');
      Alert.alert('Success!', 'You have successfully joined the household.');
      
      // Refresh user info to get updated household
      // This might require refetching user data from auth endpoint
    } catch (error) {
      console.error('Error joining household:', error);
      const errorMessage = error.response?.data?.message || 'Could not join household';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!household?._id) return;
    
    if (!Clipboard) {
      Alert.alert('Invite Code', household._id);
      return;
    }

    try {
      // Try expo-clipboard async API first
      if (Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(household._id);
      } else if (Clipboard.setString) {
        // React Native Clipboard (synchronous)
        Clipboard.setString(household._id);
      }
      Alert.alert('Copied!', 'Invite code copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      // Fallback: show the code in an alert so user can copy manually
      Alert.alert('Invite Code', household._id);
    }
  };

  const handleShareInviteCode = async () => {
    if (!household?._id) return;

    try {
      const result = await Share.share({
        message: `Join my household on Smart Shopping! Invite code: ${household._id}`,
        title: 'Join My Household',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

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

      <ScrollView style={styles.scrollView}>
        {household ? (
          <>
            <View style={styles.inviteContainer}>
              <Text style={styles.inviteTitle}>Household Name:</Text>
              <Text style={styles.householdName}>{household.name}</Text>
              
              <Text style={styles.inviteTitle}>Invite Code:</Text>
              <View style={styles.inviteCodeContainer}>
                <Text style={styles.inviteCode}>{household._id}</Text>
              </View>
              
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.copyButton]}
                  onPress={handleCopyInviteCode}
                >
                  <Ionicons name="copy-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Copy</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.actionButton, styles.shareButton]}
                  onPress={handleShareInviteCode}
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.inviteInfo}>
                Share this code with others to let them join your household.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => setShowJoinModal(true)}
            >
              <Ionicons name="person-add-outline" size={20} color="#007bff" />
              <Text style={styles.joinButtonText}>Join Another Household</Text>
            </TouchableOpacity>

            <Text style={styles.membersTitle}>Members ({household.members?.length || 0}):</Text>
            <FlatList
              data={household.members || []}
              renderItem={renderMember}
              keyExtractor={(item) => item._id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No members yet</Text>
              }
            />
          </>
        ) : (
          <View style={styles.joinPromptContainer}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.joinPromptText}>Join a Household</Text>
            <Text style={styles.joinPromptSubtext}>
              Enter an invite code to join a household and start sharing a shopping list!
            </Text>
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => setShowJoinModal(true)}
            >
              <Text style={styles.joinButtonText}>Join Household</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Join Household Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join Household</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowJoinModal(false);
                  setInviteCode('');
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter the invite code to join a household
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Enter invite code"
              placeholderTextColor="#999"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isJoining}
            />

            <TouchableOpacity
              style={[styles.modalJoinButton, isJoining && styles.modalJoinButtonDisabled]}
              onPress={handleJoinHousehold}
              disabled={isJoining}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.modalJoinButtonText}>Join</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  inviteCodeContainer: {
    backgroundColor: '#f2f2f2',
    borderRadius: 5,
    padding: 10,
    marginTop: 5,
    marginBottom: 10,
  },
  inviteCode: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#28a745',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 5,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  copyButton: {
    backgroundColor: '#28a745',
  },
  shareButton: {
    backgroundColor: '#007bff',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#007bff',
    gap: 8,
  },
  joinButtonText: {
    color: '#007bff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  joinPromptContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  joinPromptText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  joinPromptSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    color: '#999',
    fontSize: 16,
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
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    marginBottom: 20,
  },
  modalJoinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 15,
    borderRadius: 10,
    gap: 8,
  },
  modalJoinButtonDisabled: {
    opacity: 0.6,
  },
  modalJoinButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
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