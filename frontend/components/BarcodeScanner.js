import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

// Camera barcode scanning temporarily disabled due to build compatibility issues
// Manual input works perfectly - users can enter barcodes manually
const BarCodeScanner = null;

// Conditionally import expo-location (optional - requires native module)
let Location = null;
try {
  Location = require('expo-location');
} catch (error) {
  console.log('expo-location not available:', error.message);
}

const API_URL = 'http://10.0.2.2:5001';

export default function BarcodeScanner({ visible, onClose, onProductFound, userToken }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [city, setCity] = useState('');
  const [foundProduct, setFoundProduct] = useState(null);

  useEffect(() => {
    if (visible) {
      requestCameraPermission();
      setScanned(false);
      setManualBarcode('');
      setCity('');
    }
  }, [visible]);

  const requestCameraPermission = async () => {
    if (!BarCodeScanner) {
      setHasPermission(false);
      setShowManualInput(true);
      return;
    }
    try {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        setShowManualInput(true);
      }
    } catch (error) {
      console.log('Camera permission error:', error);
      setHasPermission(false);
      setShowManualInput(true);
    }
  };

  const handleBarCodeScanned = ({ type, data }) => {
    if (!scanned) {
      setScanned(true);
      lookupProduct(data);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualBarcode.trim()) {
      Alert.alert('Error', 'Please enter a barcode');
      return;
    }
    
    setScanned(true);
    await lookupProduct(manualBarcode.trim());
  };

  const lookupProduct = async (barcode) => {
    setIsLookingUp(true);
    try {
      // Try to get user location for physical store prices (optional)
      let locationParams = {};
      if (Location) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            try {
              const location = await Location.getCurrentPositionAsync({
                timeout: 5000, // 5 second timeout
              });
              locationParams.lat = location.coords.latitude;
              locationParams.lng = location.coords.longitude;
            } catch (locError) {
              // Location fetch failed, continue without it
              console.log('Could not get current location:', locError.message);
            }
          }
        } catch (error) {
          // Permission request failed, continue without location
          console.log('Location permission not available:', error.message);
        }
      }

      // Build query params
      const params = new URLSearchParams();
      if (locationParams.lat) params.append('lat', locationParams.lat);
      if (locationParams.lng) params.append('lng', locationParams.lng);
      if (city && city.trim()) {
        params.append('city', city.trim());
        console.log('Sending city to backend:', city.trim());
      }
      
      const queryString = params.toString();
      const url = `${API_URL}/api/products/barcode/${barcode}${queryString ? '?' + queryString : ''}`;
      
      console.log('Fetching product from:', url);
      const response = await axios.get(url);
      
      if (response.data.success && response.data.product) {
        const product = response.data.product;
        const prices = response.data.prices || [];
        
        // Store product to show in custom modal with image
        setFoundProduct({
          ...product,
          prices: prices,
        });
        setIsLookingUp(false);
      } else {
        Alert.alert(
          'Product Not Found',
          'Would you like to add it manually?',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setScanned(false);
                setIsLookingUp(false);
              },
            },
            {
              text: 'Add Manually',
              onPress: () => {
                if (onProductFound) {
                  onProductFound({
                    barcode: barcode,
                    name: 'Unknown Product',
                    brand: '',
                  });
                }
                handleClose();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Barcode lookup error:', error);
      Alert.alert(
        'Error',
        'Could not lookup product. Try again or add manually.',
        [
          {
            text: 'OK',
            onPress: () => {
              setScanned(false);
              setIsLookingUp(false);
            },
          },
        ]
      );
    }
  };

  const handleClose = () => {
    setScanned(false);
    setIsLookingUp(false);
    setManualBarcode('');
    setCity('');
    setShowManualInput(false);
    onClose();
  };

  if (!visible) return null;

  // Show product result modal if product found
  if (foundProduct) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Product Found!</Text>
            <TouchableOpacity onPress={() => {
              setFoundProduct(null);
              setScanned(false);
            }}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scrollContent} contentContainerStyle={styles.productContent}>
            {/* Product Image */}
            {foundProduct.images && foundProduct.images.length > 0 && foundProduct.images[0] ? (
              <Image 
                source={{ uri: foundProduct.images[0] }} 
                style={styles.productImage}
                resizeMode="contain"
              />
            ) : foundProduct.imageUrl ? (
              <Image 
                source={{ uri: foundProduct.imageUrl }} 
                style={styles.productImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="image-outline" size={64} color="#ccc" />
              </View>
            )}
            
            {/* Product Info */}
            <Text style={styles.productName}>{foundProduct.name}</Text>
            {foundProduct.brand && (
              <Text style={styles.productBrand}>{foundProduct.brand}</Text>
            )}
            
            {/* Prices */}
            {foundProduct.prices && foundProduct.prices.length > 0 ? (
              <View style={styles.pricesContainer}>
                <Text style={styles.pricesTitle}>💰 Prices:</Text>
                {foundProduct.prices.map((p, idx) => {
                  const price = p.price || p.store?.price || 0;
                  const chain = p.store?.chain || '';
                  const storeName = p.store?.name || 'Unknown Store';
                  const displayName = chain && chain !== storeName 
                    ? `${storeName} (${chain})` 
                    : storeName;
                  if (price > 0) {
                    return (
                      <View key={idx} style={styles.priceRow}>
                        <Text style={styles.priceStore}>{displayName}</Text>
                        <Text style={styles.priceValue}>₪{price.toFixed(2)}</Text>
                      </View>
                    );
                  }
                  return null;
                })}
              </View>
            ) : (
              <Text style={styles.noPrices}>⚠️ Prices not available yet</Text>
            )}
            
            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setFoundProduct(null);
                  setScanned(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.submitButton]}
                onPress={() => {
                  if (onProductFound) {
                    onProductFound(foundProduct);
                  }
                  handleClose();
                }}
              >
                <Text style={styles.submitButtonText}>Add to List</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // If camera permission not granted, show manual input
  if (hasPermission === false || showManualInput) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Enter Barcode</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView 
            style={styles.scrollContent}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Ionicons name="barcode-outline" size={64} color="#28a745" style={styles.icon} />
            <Text style={styles.message}>Enter Barcode Manually</Text>
            <Text style={styles.subMessage}>
              Or grant camera permission to scan barcodes with your camera.
            </Text>
            <TextInput
              style={styles.barcodeInput}
              placeholder="Enter barcode (e.g., 7290000064228)"
              value={manualBarcode}
              onChangeText={setManualBarcode}
              keyboardType="numeric"
              autoFocus
              maxLength={20}
              selectTextOnFocus
              clearButtonMode="while-editing"
              editable
            />
            <Text style={styles.label}>City (optional - for physical store prices)</Text>
            <TextInput
              style={styles.cityInput}
              placeholder="Enter city name (e.g., תל אביב, ירושלים)"
              value={city}
              onChangeText={setCity}
              textAlign="right"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              clearButtonMode="while-editing"
              multiline={false}
              keyboardType="default"
            />
            {isLookingUp ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#28a745" />
                <Text style={styles.loadingText}>Looking up product...</Text>
              </View>
            ) : (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.submitButton]}
                  onPress={handleManualSubmit}
                  disabled={!manualBarcode.trim()}
                >
                  <Text style={styles.submitButtonText}>Lookup</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // Show permission request
  if (hasPermission === null) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Camera Permission</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <ActivityIndicator size="large" color="#28a745" />
            <Text style={styles.message}>Requesting camera permission...</Text>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Show permission denied - offer manual input
  if (hasPermission === false) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Camera Access</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <Ionicons name="camera-outline" size={64} color="#999" style={styles.icon} />
            <Text style={styles.message}>Camera permission is required</Text>
            <Text style={styles.subMessage}>
              Please enable camera access in your device settings, or enter barcode manually.
            </Text>
            <TouchableOpacity
              style={styles.manualButton}
              onPress={() => setShowManualInput(true)}
            >
              <Ionicons name="keyboard-outline" size={20} color="#28a745" />
              <Text style={styles.manualButtonText}>Enter Barcode Manually</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Show manual input
  if (showManualInput) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Enter Barcode</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView 
            style={styles.scrollContent}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Ionicons name="barcode-outline" size={64} color="#28a745" style={styles.icon} />
            <Text style={styles.instruction}>
              Enter the product barcode number
            </Text>
            
            <TextInput
              style={styles.barcodeInput}
              placeholder="Enter barcode (e.g., 7290000064228)"
              value={manualBarcode}
              onChangeText={setManualBarcode}
              keyboardType="numeric"
              autoFocus
              maxLength={20}
              selectTextOnFocus
              clearButtonMode="while-editing"
              editable
            />
            <Text style={styles.label}>City (optional - for physical store prices)</Text>
            <TextInput
              style={styles.cityInput}
              placeholder="Enter city name (e.g., תל אביב, ירושלים)"
              value={city}
              onChangeText={setCity}
              textAlign="right"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              clearButtonMode="while-editing"
              multiline={false}
              keyboardType="default"
            />
            
            {isLookingUp ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#28a745" />
                <Text style={styles.loadingText}>Looking up product...</Text>
              </View>
            ) : (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    setShowManualInput(false);
                    setManualBarcode('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Back to Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.submitButton]}
                  onPress={handleManualSubmit}
                  disabled={!manualBarcode.trim()}
                >
                  <Text style={styles.submitButtonText}>Lookup</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // Show camera scanner when permission is granted and module is available
  if (hasPermission === true && BarCodeScanner) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Scan Barcode</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <BarCodeScanner
            onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
            style={styles.camera}
          />
          <View style={styles.overlay}>
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text style={styles.instruction}>
              Point your camera at a barcode
            </Text>
            {isLookingUp && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Looking up product...</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.manualButton}
              onPress={() => setShowManualInput(true)}
            >
              <Ionicons name="keyboard-outline" size={20} color="#fff" />
              <Text style={styles.manualButtonText}>Enter Manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Fallback to manual input
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Enter Barcode</Text>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>
        <ScrollView 
          style={styles.scrollContent}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Ionicons name="barcode-outline" size={64} color="#28a745" style={styles.icon} />
          <Text style={styles.instruction}>
            Enter the product barcode number
          </Text>
          <TextInput
            style={styles.barcodeInput}
            placeholder="Enter barcode (e.g., 7290000064228)"
            value={manualBarcode}
            onChangeText={setManualBarcode}
            keyboardType="numeric"
            autoFocus
            maxLength={20}
          />
          <Text style={styles.label}>City (optional - for physical store prices)</Text>
          <TextInput
            style={styles.cityInput}
            placeholder="Enter city name (e.g., תל אביב, ירושלים)"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
            clearButtonMode="while-editing"
          />
          {isLookingUp ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#28a745" />
              <Text style={styles.loadingText}>Looking up product...</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.submitButton]}
                onPress={handleManualSubmit}
                disabled={!manualBarcode.trim()}
              >
                <Text style={styles.submitButtonText}>Lookup</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#28a745',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  instruction: {
    color: '#fff',
    fontSize: 16,
    marginTop: 30,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 8,
  },
  footer: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    gap: 8,
  },
  manualButtonText: {
    color: '#28a745',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    marginTop: 15,
    fontSize: 16,
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    padding: 30,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  icon: {
    marginBottom: 20,
  },
  message: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
  },
  subMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  closeButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    width: '100%',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  barcodeInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 12,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  cityInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 12,
    fontSize: 18,
    marginBottom: 30,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    textAlign: 'right',
    paddingRight: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 15,
  },
  button: {
    flex: 1,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#28a745',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instruction: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#28a745',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: '60%',
    alignItems: 'center',
  },
  productContent: {
    padding: 20,
    alignItems: 'center',
  },
  productImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#f5f5f5',
  },
  placeholderImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  productBrand: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  pricesContainer: {
    width: '100%',
    marginBottom: 20,
  },
  pricesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  priceStore: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28a745',
  },
  noPrices: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
});
