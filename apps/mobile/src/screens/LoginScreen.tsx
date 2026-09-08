import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  Animated,
  Pressable,
  Linking,
  Modal,
  Dimensions,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Eye, EyeOff, UserRound, Lock, MessageCircle, X, Check } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { normalizeLoginIdentifierInput } from '../lib/cpf';
import { SPLASH_BG, SPLASH_LOGO_SIZE } from '../components/AuthBrandSplash';

const SUPPORT_WHATSAPP = '5561981622021';
const SUPPORT_URL = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
  'Olá! Esqueci minha senha do sistema Gennesis e preciso de ajuda para alterar.',
)}`;

const { height: SCREEN_H } = Dimensions.get('window');
const LOGO_SIZE = SPLASH_LOGO_SIZE;
const BRAND = '#ce3736';
const SHEET_TOP = Math.round(SCREEN_H * 0.4);
const TITLES_BLOCK_H = 58;

type Props = {
  fromBootSplash?: boolean;
};

export default function LoginScreen({ fromBootSplash = true }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [focusedField, setFocusedField] = useState<'identifier' | 'password' | null>(null);
  const [error, setError] = useState('');
  const [introDone, setIntroDone] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const progress = useRef(new Animated.Value(0)).current;
  const titlesAnim = useRef(new Animated.Value(0)).current;

  // Splash: só a logo, no mesmo ponto do AuthBrandSplash (centro da tela).
  const logoTopSplash = (SCREEN_H - LOGO_SIZE) / 2;

  // Final: logo + textos centralizados na faixa vermelha acima do sheet.
  const brandFinalH = LOGO_SIZE + 12 + TITLES_BLOCK_H;
  const redBand = SHEET_TOP - insets.top;
  const logoTopFinal = insets.top + Math.max(10, (redBand - brandFinalH) / 2);
  const logoTravel = logoTopFinal - logoTopSplash;

  useEffect(() => {
    const delay = fromBootSplash ? 160 : 900;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1200,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(420),
          Animated.timing(titlesAnim, {
            toValue: 1,
            duration: 680,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start(({ finished }) => {
        if (finished) setIntroDone(true);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [fromBootSplash, progress, titlesAnim]);

  const logoTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, logoTravel],
  });

  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H - SHEET_TOP, 0],
  });

  const titlesOpacity = titlesAnim;

  const titlesTranslateY = titlesAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !loading;
  const styles = useMemo(() => getStyles(insets.bottom), [insets.bottom]);

  const handleLogin = async () => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password) {
      setError('Preencha e-mail/CPF e senha.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await login(trimmedIdentifier, password);
      Toast.show({
        type: 'success',
        text1: 'Bem-vindo',
        text2: 'Login realizado com sucesso.',
      });
    } catch (err: any) {
      const message = String(err?.message || '');
      if (
        message.toLowerCase().includes('credenciais') ||
        message.toLowerCase().includes('incorret')
      ) {
        setError('E-mail, CPF ou senha incorretos.');
      } else {
        setError(message || 'Não foi possível entrar. Tente de novo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.brandStage,
          {
            top: logoTopSplash,
            transform: [{ translateY: logoTranslateY }],
          },
        ]}
      >
        <Image
          source={require('../../assets/logobranca.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Gennesis"
        />
        <Animated.View
          style={[
            styles.titles,
            {
              opacity: titlesOpacity,
              transform: [{ translateY: titlesTranslateY }],
            },
          ]}
        >
          <Text style={styles.headline}>Bem-vindo de volta</Text>
          <Text style={styles.subheadline}>Entre na sua conta para continuar</Text>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={24}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {__DEV__ ? (
              <Text style={styles.dev} numberOfLines={1}>
                {API_CONFIG.BASE_URL.replace(/^https?:\/\//, '')}
              </Text>
            ) : null}

            <View style={styles.formFields}>
              <View style={styles.inputContainer}>
                <View style={styles.fieldIcon}>
                  <UserRound size={20} color="#9ca3af" />
                </View>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    focusedField === 'identifier' && styles.inputFocused,
                  ]}
                  value={identifier}
                  onChangeText={(v) => {
                    setIdentifier(normalizeLoginIdentifierInput(v));
                    if (error) setError('');
                  }}
                  placeholder="E-mail ou CPF"
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  placeholderTextColor="#9ca3af"
                  onFocus={() => setFocusedField('identifier')}
                  onBlur={() => setFocusedField(null)}
                  editable={!loading && introDone}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.fieldIcon}>
                  <Lock size={20} color="#9ca3af" />
                </View>
                <TextInput
                  ref={passwordRef}
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    styles.inputWithEye,
                    focusedField === 'password' && styles.inputFocused,
                  ]}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (error) setError('');
                  }}
                  placeholder="Senha"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (canSubmit) void handleLogin();
                  }}
                  placeholderTextColor="#9ca3af"
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  editable={!loading && introDone}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <EyeOff size={20} color="#6b7280" />
                  ) : (
                    <Eye size={20} color="#6b7280" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Pressable
                style={styles.rememberRow}
                onPress={() => setRememberMe((v) => !v)}
                hitSlop={6}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
                  {rememberMe ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                </View>
                <Text style={styles.rememberText}>Lembrar-me</Text>
              </Pressable>
              <Pressable onPress={() => setShowHelp(true)} hitSlop={8}>
                <Text style={styles.forgot}>Esqueceu a senha?</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonOff]}
              onPress={handleLogin}
              disabled={!canSubmit}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.buttonText, !canSubmit && styles.buttonTextOff]}>
                  Entrar
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.footer}>© {new Date().getFullYear()} Gennesis Conecta</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <Modal
        visible={showHelp}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHelp(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowHelp(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Esqueceu a senha?</Text>
              <Pressable onPress={() => setShowHelp(false)} hitSlop={10}>
                <X size={20} color="#52525b" strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={styles.modalBody}>
              A recuperação automática está desativada. Solicite a alteração pelo WhatsApp.
            </Text>
            <TouchableOpacity
              style={styles.whatsappBtn}
              activeOpacity={0.9}
              onPress={() => {
                void Linking.openURL(SUPPORT_URL);
                setShowHelp(false);
              }}
            >
              <MessageCircle size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.whatsappText}>Solicitar via WhatsApp</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (bottomInset: number) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: SPLASH_BG,
    },
    flex: {
      flex: 1,
    },
    brandStage: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 3,
    },
    logo: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
    },
    titles: {
      position: 'absolute',
      top: LOGO_SIZE + 12,
      left: 24,
      right: 24,
      alignItems: 'center',
    },
    headline: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
      color: '#ffffff',
      textAlign: 'center',
    },
    subheadline: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '400',
      color: 'rgba(255,255,255,0.85)',
      textAlign: 'center',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      top: SHEET_TOP,
      backgroundColor: '#ffffff',
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      zIndex: 4,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowOffset: { width: 0, height: -6 },
      shadowRadius: 18,
      elevation: 10,
    },
    sheetScroll: {
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: Math.max(bottomInset, 16) + 12,
      flexGrow: 1,
    },
    dev: {
      marginBottom: 18,
      fontSize: 11,
      color: '#9ca3af',
      textAlign: 'center',
    },
    formFields: {
      gap: 18,
    },
    inputContainer: {
      position: 'relative',
      justifyContent: 'center',
    },
    fieldIcon: {
      position: 'absolute',
      left: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      zIndex: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      fontSize: 16,
      color: '#111827',
      backgroundColor: '#ffffff',
    },
    inputWithIcon: {
      paddingLeft: 42,
    },
    inputWithEye: {
      paddingRight: 45,
    },
    inputFocused: {
      borderColor: BRAND,
    },
    eyeButton: {
      position: 'absolute',
      right: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      zIndex: 10,
    },
    metaRow: {
      marginTop: 16,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rememberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: '#d1d5db',
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: {
      backgroundColor: BRAND,
      borderColor: BRAND,
    },
    rememberText: {
      fontSize: 13,
      color: '#4b5563',
      fontWeight: '500',
    },
    forgot: {
      fontSize: 13,
      fontWeight: '600',
      color: BRAND,
    },
    error: {
      marginTop: 8,
      marginBottom: 4,
      fontSize: 13,
      color: BRAND,
    },
    button: {
      marginTop: 18,
      height: 54,
      borderRadius: 999,
      backgroundColor: BRAND,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonOff: {
      backgroundColor: '#e5e7eb',
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    buttonTextOff: {
      color: '#9ca3af',
    },
    footer: {
      marginTop: 28,
      textAlign: 'center',
      fontSize: 12,
      color: '#9ca3af',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    modalCard: {
      backgroundColor: '#fff',
      borderRadius: 18,
      padding: 22,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#111111',
    },
    modalBody: {
      fontSize: 14,
      lineHeight: 21,
      color: '#52525b',
      marginBottom: 20,
    },
    whatsappBtn: {
      height: 48,
      borderRadius: 12,
      backgroundColor: '#16a34a',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    whatsappText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
  });
