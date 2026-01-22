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
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

// Import react-native-vision-camera for barcode scanning
let VisionCamera = null;
let useCameraDevice = null;
let useCodeScanner = null;

try {
  const visionCamera = require('react-native-vision-camera');
  VisionCamera = visionCamera.Camera;
  // Try both possible hook names
  useCameraDevice = visionCamera.useCameraDevice || visionCamera.useCameraDevices;
  useCodeScanner = visionCamera.useCodeScanner;
} catch (error) {
  console.log('react-native-vision-camera not available:', error.message);
  VisionCamera = null;
}

// Conditionally import expo-location (optional - requires native module)
let Location = null;
try {
  Location = require('expo-location');
} catch (error) {
  console.log('expo-location not available:', error.message);
}

const API_URL = 'http://10.0.2.2:5001';

// Camera Scanner Component - only rendered if VisionCamera is available
// Note: This component will only be used if VisionCamera module is loaded
function CameraScannerView({ onCodeScanned, scanned, city, setCity, isLookingUp, onManualInput, onClose }) {
  const [lastDetectedCode, setLastDetectedCode] = useState(null);
  const [detectionCount, setDetectionCount] = useState(0);
  
  console.log('CameraScannerView rendering, useCameraDevice:', !!useCameraDevice, 'useCodeScanner:', !!useCodeScanner);
  
  // Hooks must be called unconditionally
  // If hooks don't exist, this will throw - component won't be rendered
  if (!useCameraDevice || !useCodeScanner) {
    console.log('Camera hooks not available');
    return (
      <Modal visible={true} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Camera Error</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <Text style={styles.message}>Camera hooks not available. Please reload the app.</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }
  
  // Get camera device - hooks must be called unconditionally
  let device = null;
  try {
    // Try new API: useCameraDevice('back')
    device = useCameraDevice('back');
    console.log('Got camera device (new API):', !!device, device ? `Device ID: ${device.id}` : 'null');
  } catch (e) {
    // Try old API: useCameraDevices().back
    try {
      const devices = useCameraDevice();
      device = devices?.back || null;
      console.log('Got camera device (old API):', !!device, device ? `Device ID: ${device.id}` : 'null');
    } catch (e2) {
      console.log('Camera device hook error:', e2.message);
      return (
        <Modal visible={true} animationType="slide" transparent={false}>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>Camera Error</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.content}>
              <Text style={styles.message}>Could not access camera device. Error: {e2.message}</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      );
    }
  }

  // Check if device is actually available
  if (!device) {
    console.log('Camera device is null - waiting for device...');
    return (
      <Modal visible={true} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Camera Loading</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <ActivityIndicator size="large" color="#28a745" />
            <Text style={styles.message}>Initializing camera...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const codeScanner = useCodeScanner({
    // Valid barcode types for react-native-vision-camera
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'code-93', 'codabar', 'qr', 'pdf-417', 'aztec', 'data-matrix'],
    onCodeScanned: (codes) => {
      console.log('🔍🔍🔍 CodeScanner callback triggered! Codes received:', codes.length);
      console.log('🔍 Full codes array:', JSON.stringify(codes, null, 2));
      setDetectionCount(prev => prev + 1);
      
      if (codes.length > 0) {
        console.log('✅ First code object:', codes[0]);
        console.log('✅ Code value:', codes[0].value);
        console.log('✅ Code type:', codes[0].type);
        console.log('✅ Code frame:', codes[0].frame);
        setLastDetectedCode(codes[0].value || 'No value');
      } else {
        console.log('⚠️ Codes array is empty');
        setLastDetectedCode(null);
      }
      
      if (!scanned && codes.length > 0 && codes[0].value) {
        console.log('✅✅✅ Barcode scanned successfully:', codes[0].value);
        onCodeScanned(codes[0].value);
      } else if (scanned) {
        console.log('⚠️ Already scanned, ignoring new codes');
      } else if (codes.length === 0) {
        console.log('⚠️ Codes array is empty - scanner running but no codes detected');
      } else if (!codes[0].value) {
        console.log('⚠️ Code has no value:', codes[0]);
      }
    },
  });
  
  console.log('📷 CodeScanner created:', !!codeScanner, 'Type:', typeof codeScanner);
  
  // Test if codeScanner callback works at all
  useEffect(() => {
    console.log('📷 CameraScannerView mounted - CodeScanner should be active');
    console.log('📷 Device:', device ? `ID: ${device.id}, Position: ${device.position}` : 'NULL');
    console.log('📷 CodeScanner object:', codeScanner ? 'EXISTS' : 'NULL');
    console.log('📷 VisionCamera:', VisionCamera ? 'EXISTS' : 'NULL');
    
    // Log every 5 seconds to verify component is alive
    const interval = setInterval(() => {
      console.log('⏱️ Scanner still active, waiting for codes... (no detections yet)');
    }, 5000);
    
    return () => {
      clearInterval(interval);
      console.log('📷 CameraScannerView unmounting');
    };
  }, [device, codeScanner]);

  if (!VisionCamera || !device || !codeScanner) {
    console.log('Missing camera components - VisionCamera:', !!VisionCamera, 'device:', !!device, 'codeScanner:', !!codeScanner);
    return (
      <Modal visible={true} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Camera Error</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <Text style={styles.message}>
              Camera not ready. VisionCamera: {VisionCamera ? 'Yes' : 'No'}, Device: {device ? 'Yes' : 'No'}, CodeScanner: {codeScanner ? 'Yes' : 'No'}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }
  
  console.log('Rendering camera view successfully - Device:', device.id, 'Position:', device.position);

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan Barcode</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.cameraContainer}>
          <VisionCamera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            codeScanner={codeScanner}
            enableZoomGesture={false}
            orientation="portrait"
            pixelFormat="yuv"
          />
          {/* Debug info overlay */}
          {__DEV__ && (
            <View style={{ position: 'absolute', top: 100, left: 20, backgroundColor: 'rgba(255,0,0,0.8)', padding: 10, borderRadius: 5, zIndex: 1000 }}>
              <Text style={{ color: '#fff', fontSize: 10 }}>
                Camera: {device ? 'OK' : 'NULL'}
              </Text>
              <Text style={{ color: '#fff', fontSize: 10 }}>
                Scanner: {codeScanner ? 'OK' : 'NULL'}
              </Text>
              <Text style={{ color: '#fff', fontSize: 10 }}>
                Active: {true ? 'YES' : 'NO'}
              </Text>
            </View>
          )}
        </View>
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
          <Text style={[styles.instruction, { fontSize: 12, marginTop: 5, color: '#ffeb3b' }]}>
            {scanned ? 'Processing...' : 'Hold steady over the barcode'}
          </Text>
          {__DEV__ && (
            <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', padding: 8, borderRadius: 5, marginTop: 10 }}>
              <Text style={[styles.instruction, { fontSize: 10, color: '#0f0' }]}>
                Scanner: Active | Detections: {detectionCount}
              </Text>
              {lastDetectedCode && (
                <Text style={[styles.instruction, { fontSize: 10, color: '#0ff', marginTop: 3 }]}>
                  Last detected: {lastDetectedCode}
                </Text>
              )}
            </View>
          )}
          
          {/* City/Address Input for Price Filtering */}
          <View style={styles.cityInputContainer}>
            <Ionicons name="location-outline" size={20} color="#fff" style={styles.locationIcon} />
            <TextInput
              style={styles.cityInputOverlay}
              placeholder="Enter city/address (optional)"
              placeholderTextColor="rgba(255,255,255,0.7)"
              value={city}
              onChangeText={setCity}
              textAlign="right"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
          </View>
          
          {isLookingUp && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Looking up product...</Text>
            </View>
          )}
          
          <TouchableOpacity
            style={styles.manualButton}
            onPress={onManualInput}
          >
            <Ionicons name="keyboard-outline" size={20} color="#fff" />
            <Text style={styles.manualButtonText}>Enter Manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

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
      setScanned(false);
      setManualBarcode('');
      setCity('');
      // Only auto-request permission if VisionCamera is available
      if (VisionCamera) {
        requestCameraPermission();
      } else {
        setHasPermission(false);
        setShowManualInput(true);
      }
    }
  }, [visible]);

  // Update showManualInput when permission changes
  useEffect(() => {
    if (hasPermission === true && VisionCamera) {
      setShowManualInput(false);
    } else if (hasPermission === false) {
      setShowManualInput(true);
    }
  }, [hasPermission]);

  const requestCameraPermission = async () => {
    // Ensure VisionCamera is loaded
    if (!VisionCamera) {
      console.log('VisionCamera not available, trying to load...');
      try {
        const visionCamera = require('react-native-vision-camera');
        VisionCamera = visionCamera.Camera;
        
        if (!VisionCamera) {
          throw new Error('Camera not found in react-native-vision-camera');
        }
        console.log('VisionCamera loaded successfully');
      } catch (e) {
        console.log('Could not load VisionCamera:', e.message);
        Alert.alert('Error', `Could not load camera module: ${e.message}. Please restart the app.`);
        setHasPermission(false);
        setShowManualInput(true);
        return;
      }
    }
    
    // Check if Camera has the permission methods
    if (typeof VisionCamera.getCameraPermissionStatus !== 'function' || 
        typeof VisionCamera.requestCameraPermission !== 'function') {
      console.log('Camera permission methods not available');
      Alert.alert('Error', 'Camera permission API is not available. Please restart the app.');
      setHasPermission(false);
      setShowManualInput(true);
      return;
    }
    
    try {
      // First, check current permission status
      console.log('Checking current camera permission status...');
      const currentStatus = await VisionCamera.getCameraPermissionStatus();
      console.log('Current permission status:', currentStatus);
      
      // If already authorized, we're good
      // Check for both 'authorized' and 'granted' (some versions might use different values)
      if (currentStatus === 'authorized' || currentStatus === 'granted') {
        console.log('Camera permission already granted! Status:', currentStatus);
        setHasPermission(true);
        setShowManualInput(false);
        return;
      }
      
      // If denied, we can't request again - need to go to settings
      if (currentStatus === 'denied') {
        Alert.alert(
          'Camera Permission Required',
          'Camera permission was denied. Please enable it in your device settings to use the camera scanner.',
          [
            { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Open Settings', 
                onPress: async () => {
                  try {
                    if (Platform.OS === 'android') {
                      // Open Android app settings
                      await Linking.openSettings();
                    } else {
                      // iOS
                      await Linking.openURL('app-settings:');
                    }
                  } catch (error) {
                    Alert.alert('Settings', 'Please go to: Settings > Apps > Smart Shopping > Permissions > Camera and enable it.');
                  }
                }
              }
          ]
        );
        setHasPermission(false);
        setShowManualInput(true);
        return;
      }
      
      // Request permission (for 'not-determined' or 'restricted' status)
      console.log('Requesting camera permission from system...');
      const permission = await VisionCamera.requestCameraPermission();
      console.log('Permission result:', permission);
      
      // react-native-vision-camera returns 'authorized', 'denied', 'restricted', or 'not-determined'
      // Also check for 'granted' in case some versions use that
      const granted = permission === 'authorized' || permission === 'granted';
      setHasPermission(granted);
      
      console.log('Permission check - permission:', permission, 'granted:', granted);
      
      if (!granted) {
        if (permission === 'denied') {
          Alert.alert(
            'Camera Permission Denied',
            'Camera permission was denied. Please enable it in your device settings to use the camera scanner.',
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Open Settings', 
                onPress: async () => {
                  try {
                    if (Platform.OS === 'android') {
                      // Open Android app settings
                      await Linking.openSettings();
                    } else {
                      // iOS
                      await Linking.openURL('app-settings:');
                    }
                  } catch (error) {
                    Alert.alert('Settings', 'Please go to: Settings > Apps > Smart Shopping > Permissions > Camera and enable it.');
                  }
                }
              }
            ]
          );
        } else if (permission === 'restricted') {
          Alert.alert(
            'Camera Permission Restricted',
            'Camera permission is restricted on this device. Please check your device settings.'
          );
        } else {
          // 'not-determined' or other status
          Alert.alert(
            'Camera Permission Required',
            'Camera permission is required to scan barcodes. Please grant permission when prompted, or enable it in your device settings.'
          );
        }
        setShowManualInput(true);
      } else {
        console.log('Camera permission granted!');
        setShowManualInput(false);
      }
    } catch (error) {
      console.log('Camera permission error:', error);
      Alert.alert('Error', `Failed to request camera permission: ${error.message}`);
      setHasPermission(false);
      setShowManualInput(true);
    }
  };

  const handleUseCamera = async () => {
    console.log('handleUseCamera called');
    
    // Try to load VisionCamera if not already loaded
    if (!VisionCamera) {
      try {
        console.log('Loading VisionCamera module...');
        const visionCamera = require('react-native-vision-camera');
        VisionCamera = visionCamera.Camera;
        useCameraDevice = visionCamera.useCameraDevice || visionCamera.useCameraDevices;
        useCodeScanner = visionCamera.useCodeScanner;
        
        console.log('VisionCamera loaded:', !!VisionCamera);
        console.log('useCameraDevice loaded:', !!useCameraDevice);
        console.log('useCodeScanner loaded:', !!useCodeScanner);
        
        if (!VisionCamera) {
          throw new Error('Camera not found in react-native-vision-camera module');
        }
      } catch (error) {
        console.log('Error loading VisionCamera:', error);
        Alert.alert(
          'Camera Not Available', 
          `The camera module is not available. Error: ${error.message}. Please make sure the build completed successfully and restart the app.`
        );
        return;
      }
    }
    
    console.log('Requesting camera permission...');
    await requestCameraPermission();
    console.log('Permission request completed. hasPermission:', hasPermission);
    
    // Force update to show camera view if permission granted
    if (hasPermission === true && VisionCamera) {
      console.log('Permission granted, showing camera view');
      setShowManualInput(false);
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

      // Build query params (send address parameter like chp.co.il)
      const params = new URLSearchParams();
      if (locationParams.lat) params.append('lat', locationParams.lat);
      if (locationParams.lng) params.append('lng', locationParams.lng);
      if (city && city.trim()) {
        params.append('address', city.trim()); // Send as address parameter (can be full address)
        console.log('Sending address to backend:', city.trim());
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
                <Text style={styles.pricesTitle}>💰 Prices in {city && city.trim() ? city.trim() : 'stores'}:</Text>
                {foundProduct.prices
                  .filter(p => {
                    const price = p.price || p.store?.price || 0;
                    return price > 0;
                  })
                  .sort((a, b) => {
                    const priceA = a.price || a.store?.price || 0;
                    const priceB = b.price || b.store?.price || 0;
                    return priceA - priceB;
                  })
                  .map((p, idx) => {
                    const price = p.price || p.store?.price || 0;
                    const chain = p.store?.chain || '';
                    const storeName = p.store?.name || 'Unknown Store';
                    const storeType = p.store?.storeType || 'physical';
                    const distance = p.distance !== undefined && p.distance !== null ? p.distance : null;
                    const isPhysical = storeType === 'physical';
                    
                    // Format display name
                    let displayName = storeName;
                    if (chain && chain !== storeName) {
                      displayName = `${chain} - ${storeName}`;
                    } else if (chain) {
                      displayName = chain;
                    }
                    
                    return (
                      <View key={idx} style={styles.priceRow}>
                        <View style={styles.priceStoreInfo}>
                          <View style={styles.priceStoreHeader}>
                            <Text style={styles.priceStore}>{displayName}</Text>
                            {isPhysical ? (
                              <Ionicons name="storefront" size={16} color="#28a745" />
                            ) : (
                              <Ionicons name="globe" size={16} color="#2196F3" />
                            )}
                          </View>
                          {distance !== null && (
                            <Text style={styles.priceDistance}>
                              {distance.toFixed(1)} ק"מ
                            </Text>
                          )}
                        </View>
                        <Text style={styles.priceValue}>₪{price.toFixed(2)}</Text>
                      </View>
                    );
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
            
            {/* Camera Button - Always show */}
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={handleUseCamera}
            >
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={styles.cameraButtonText}>Scan with Camera</Text>
            </TouchableOpacity>
            
            <Text style={styles.orText}>OR</Text>
            
            <Text style={styles.message}>Enter Barcode Manually</Text>
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
            
            {/* Camera Button - Always show */}
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={handleUseCamera}
            >
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={styles.cameraButtonText}>Scan with Camera</Text>
            </TouchableOpacity>
            
            <Text style={styles.orText}>OR</Text>
            
            <Text style={styles.instruction}>
              Enter the product barcode number manually
            </Text>
            
            <TextInput
              style={styles.barcodeInput}
              placeholder="Enter barcode (e.g., 7290000064228)"
              value={manualBarcode}
              onChangeText={setManualBarcode}
              keyboardType="numeric"
              autoFocus={false}
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
  // Also check that we're not showing manual input
  if (hasPermission === true && VisionCamera && visible && !showManualInput) {
    console.log('Rendering camera view - hasPermission:', hasPermission, 'VisionCamera:', !!VisionCamera, 'showManualInput:', showManualInput);
    return (
      <CameraScannerView
        onCodeScanned={(data) => {
          console.log('📷 CameraScannerView onCodeScanned called with:', data);
          setScanned(true);
          lookupProduct(data);
        }}
        scanned={scanned}
        city={city}
        setCity={setCity}
        isLookingUp={isLookingUp}
        onManualInput={() => setShowManualInput(true)}
        onClose={handleClose}
      />
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
          
          {/* Camera Button - Always show, will handle errors if module not available */}
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={handleUseCamera}
          >
            <Ionicons name="camera" size={24} color="#fff" />
            <Text style={styles.cameraButtonText}>Scan with Camera</Text>
          </TouchableOpacity>
          
          <Text style={styles.orText}>OR</Text>
          
          <Text style={styles.instruction}>
            Enter the product barcode number manually
          </Text>
          
          <TextInput
            style={styles.barcodeInput}
            placeholder="Enter barcode (e.g., 7290000064228)"
            value={manualBarcode}
            onChangeText={setManualBarcode}
            keyboardType="numeric"
            autoFocus={!VisionCamera}
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
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
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
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  priceStoreInfo: {
    flex: 1,
    marginRight: 10,
  },
  priceStoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  priceStore: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  priceDistance: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
    minWidth: 80,
    textAlign: 'right',
  },
  cityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 25,
    marginTop: 20,
    marginBottom: 10,
    width: '90%',
    maxWidth: 400,
  },
  locationIcon: {
    marginRight: 8,
  },
  cityInputOverlay: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 5,
  },
  noPrices: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    width: '100%',
    gap: 10,
  },
  cameraButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 15,
    marginTop: 5,
  },
});
