import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  startTransition,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';

type Theme = 'light' | 'dark';

interface ThemeColors {
  /** Base sólida por trás do padrão de engenharia. */
  appShell: string;
  /** Raiz das telas — transparente para o padrão aparecer. */
  screenRoot: 'transparent';
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  icon: string;
  iconBackground: string;
  shadow: string;
  headerBackground: string;
  headerText: string;
}

interface ThemeContextData {
  theme: Theme;
  colors: ThemeColors;
  toggleTheme: () => void;
  isDark: boolean;
}

const lightColors: ThemeColors = {
  appShell: '#f4f6f8',
  screenRoot: 'transparent',
  background: '#f4f6f8',
  surface: '#ffffff',
  card: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  primary: '#ce3736',
  border: '#e5e7eb',
  error: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  icon: '#6b7280',
  iconBackground: '#fee2e2',
  shadow: '#000',
  headerBackground: '#ce3736',
  headerText: '#ffffff',
};

const darkColors: ThemeColors = {
  appShell: '#111827',
  screenRoot: 'transparent',
  background: '#111827',
  surface: '#1f2937',
  card: '#374151',
  text: '#f9fafb',
  textSecondary: '#9ca3af',
  primary: '#ef4444',
  border: '#4b5563',
  error: '#f87171',
  success: '#34d399',
  warning: '#fbbf24',
  icon: '#d1d5db',
  iconBackground: '#7f1d1d',
  shadow: '#000',
  headerBackground: '#1f2937',
  headerText: '#f9fafb',
};

const THEME_STORAGE_KEY = '@theme';

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

function persistTheme(next: Theme) {
  InteractionManager.runAfterInteractions(() => {
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch((error) => {
      console.error('Erro ao salvar tema:', error);
    });
  });
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (cancelled) return;
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setTheme(savedTheme);
        }
      } catch (error) {
        console.error('Erro ao carregar tema:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    startTransition(() => {
      setTheme((prev) => {
        const next: Theme = prev === 'light' ? 'dark' : 'light';
        persistTheme(next);
        return next;
      });
    });
  }, []);

  const value = useMemo<ThemeContextData>(
    () => ({
      theme,
      colors: theme === 'light' ? lightColors : darkColors,
      toggleTheme,
      isDark: theme === 'dark',
    }),
    [theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  }
  return context;
};
