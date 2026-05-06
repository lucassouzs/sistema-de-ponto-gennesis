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
import { X, Menu as MenuIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

interface MenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function Menu({ visible, onClose }: MenuProps) {
  const { colors } = useTheme();
  const slideAnim = React.useRef(new Animated.Value(-300)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = React.useState(false);
  
  // Versão do app
  const APP_VERSION = '1.0.0';

  React.useEffect(() => {
    if (visible) {
      setIsVisible(true);
      // Animar overlay e menu simultaneamente
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
      // Animar fechamento
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
        // Só desmonta após a animação terminar
        setIsVisible(false);
      });
    }
  }, [visible]);

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
      shadowOffset: {
        width: 2,
        height: 0,
      },
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
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
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
        <Animated.View 
          style={[
            styles.overlay,
            {
              opacity: overlayOpacity
            }
          ]}
        >
        <Animated.View 
          style={[
            styles.menuContainer,
            {
              transform: [{ translateX: slideAnim }]
            }
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Menu</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Menu Content */}
          <ScrollView style={styles.menuContent}>
            {/* Estado vazio */}
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
              </Text>
            </View>
          </ScrollView>

          {/* App Version */}
          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>
              App Version {APP_VERSION}
            </Text>
          </View>
        </Animated.View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
