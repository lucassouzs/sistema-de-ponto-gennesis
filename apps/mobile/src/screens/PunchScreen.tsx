import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import Toast from 'react-native-toast-message';

const PUNCH_TYPES = [
  { type: 'ENTRY', label: 'Entrada', icon: '🌅' },
  { type: 'LUNCH_START', label: 'Início Almoço', icon: '🍽️' },
  { type: 'LUNCH_END', label: 'Fim Almoço', icon: '🍽️' },
  { type: 'EXIT', label: 'Saída', icon: '🌆' },
];

export default function PunchScreen() {
  const [selectedType, setSelectedType] = useState('ENTRY');
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const { user } = useAuth();
  const cameraRef = useRef<Camera>(null);

  React.useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    // Solicitar permissão da câmera
    const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
    setCameraPermission(cameraStatus === 'granted');

    // Solicitar permissão de localização
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(locationStatus === 'granted');

    if (locationStatus === 'granted') {
      getCurrentLocation();
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(location);
    } catch (error) {
      console.error('Erro ao obter localização:', error);
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });
      
      setPhoto(photo.uri);
    } catch (error) {
      console.error('Erro ao tirar foto:', error);
      Alert.alert('Erro', 'Não foi possível tirar a foto');
    }
  };

  const punchInOut = async () => {
    if (!photo) {
      Alert.alert('Erro', 'Por favor, tire uma foto antes de bater o ponto');
      return;
    }

    if (!location) {
      Alert.alert('Erro', 'Não foi possível obter sua localização');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('type', selectedType);
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());
      formData.append('photo', {
        uri: photo,
        type: 'image/jpeg',
        name: 'punch_photo.jpg',
      } as any);

      const token = await AsyncStorage.getItem('token');
      
      const response = await fetch('http://localhost:5000/api/time-records/punch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao registrar ponto');
      }

      const data = await response.json();
      
      if (data.success) {
        Toast.show({
          type: 'success',
          text1: 'Ponto registrado com sucesso!',
        });
        setPhoto(null);
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao registrar ponto',
        text2: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (cameraPermission === null || locationPermission === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Solicitando permissões...</Text>
      </View>
    );
  }

  if (cameraPermission === false || locationPermission === false) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          Permissões necessárias não foram concedidas
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermissions}>
          <Text style={styles.buttonText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bater Ponto</Text>
        <Text style={styles.subtitle}>Olá, {user?.name}</Text>
      </View>

      {/* Tipo de Ponto */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tipo de Registro</Text>
        <View style={styles.punchTypes}>
          {PUNCH_TYPES.map((punchType) => (
            <TouchableOpacity
              key={punchType.type}
              style={[
                styles.punchTypeButton,
                selectedType === punchType.type && styles.punchTypeButtonSelected,
              ]}
              onPress={() => setSelectedType(punchType.type)}
            >
              <Text style={styles.punchTypeIcon}>{punchType.icon}</Text>
              <Text
                style={[
                  styles.punchTypeText,
                  selectedType === punchType.type && styles.punchTypeTextSelected,
                ]}
              >
                {punchType.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Localização */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Localização</Text>
        <View style={styles.locationCard}>
          <Text style={styles.locationText}>
            {location ? '✅ Localização obtida' : '⏳ Obtendo localização...'}
          </Text>
          {location && (
            <Text style={styles.locationCoords}>
              {location.coords.latitude.toFixed(6)}, {location.coords.longitude.toFixed(6)}
            </Text>
          )}
        </View>
      </View>

      {/* Câmera */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Foto Obrigatória</Text>
        
        {!photo ? (
          <View style={styles.cameraContainer}>
            <Camera
              ref={cameraRef}
              style={styles.camera}
              type={Camera.Constants.Type.front}
            />
            <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
              <Text style={styles.captureButtonText}>📷 Capturar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoContainer}>
            <Image source={{ uri: photo }} style={styles.photo} />
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => setPhoto(null)}
            >
              <Text style={styles.retakeButtonText}>Nova Foto</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Botão de Confirmar */}
      <TouchableOpacity
        style={[styles.confirmButton, loading && styles.confirmButtonDisabled]}
        onPress={punchInOut}
        disabled={loading || !photo || !location}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.confirmButtonText}>
            Bater Ponto - {PUNCH_TYPES.find(p => p.type === selectedType)?.label}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    margin: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  punchTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  punchTypeButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  punchTypeButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  punchTypeIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  punchTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  punchTypeTextSelected: {
    color: '#1d4ed8',
  },
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  locationText: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    color: '#6b7280',
  },
  cameraContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  camera: {
    height: 300,
  },
  captureButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    alignItems: 'center',
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  photoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  photo: {
    height: 300,
    width: '100%',
  },
  retakeButton: {
    backgroundColor: '#6b7280',
    padding: 16,
    alignItems: 'center',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#3b82f6',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
