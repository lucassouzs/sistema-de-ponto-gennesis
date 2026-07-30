import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import { X, Droplets, CalendarCheck } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../../App';

interface MenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function Menu({ visible, onClose }: MenuProps) {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const slideAnim = React.useRef(new Animated.Value(-300)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = React.useState(false);

  const APP_VERSION = '1.0.3';

  React.useEffect(() => {
    if (visible) {
      setIsVisible(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
      });
    }
  }, [visible, overlayOpacity, slideAnim]);

  const goTab = (name: 'Combustivel' | 'Reservas') => {
    onClose();
    setTimeout(() => {
      navigation.navigate(name as never);
    }, 280);
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-start',
    },
    menuContainer: {
      backgroundColor: colors.card,
      width: '80%',
      height: '100%',
      paddingTop: 50,
      paddingHorizontal: 20,
      shadowColor: '#000',
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 30,
      paddingBottom: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
    },
    closeButton: {
      padding: 8,
      borderRadius: 20,
    },
    menuContent: {
      flex: 1,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 15,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuItemText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    versionContainer: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      right: 20,
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    versionText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
  });

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Animated.View
            style={[
              styles.menuContainer,
              { transform: [{ translateX: slideAnim }] },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Menu</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.menuContent}>
              <TouchableOpacity style={styles.menuItem} onPress={() => goTab('Combustivel')}>
                <Droplets size={20} color={colors.primary} />
                <Text style={styles.menuItemText}>Solicitar combustível</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => goTab('Reservas')}>
                <CalendarCheck size={20} color={colors.primary} />
                <Text style={styles.menuItemText}>Reserva de veículo</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.versionContainer}>
              <Text style={styles.versionText}>App Version {APP_VERSION}</Text>
            </View>
          </Animated.View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
