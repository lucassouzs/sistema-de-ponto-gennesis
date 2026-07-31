import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  StyleSheet,
  Pressable,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

type Mode = 'date' | 'datetime';

type DateFieldProps = {
  label: string;
  /** Valor em `YYYY-MM-DD` (date) ou `YYYY-MM-DDTHH:mm` (datetime) */
  value: string;
  onChange: (value: string) => void;
  mode?: Mode;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function formatDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTimeValue(d: Date): string {
  const snapped = new Date(d);
  const minute = snapped.getMinutes();
  const steps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  let best = steps[0];
  let bestDist = Math.abs(minute - best);
  for (const step of steps) {
    const dist = Math.abs(minute - step);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  snapped.setMinutes(best, 0, 0);
  return `${formatDateValue(snapped)}T${pad(snapped.getHours())}:${pad(snapped.getMinutes())}`;
}

function parseValue(value: string, mode: Mode): Date {
  if (!value) return new Date();
  if (mode === 'datetime') {
    // YYYY-MM-DDTHH:mm
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) {
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    }
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function displayLabel(value: string, mode: Mode): string {
  if (!value) return '';
  const d = parseValue(value, mode);
  if (Number.isNaN(d.getTime())) return value;
  if (mode === 'datetime') {
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function DateField({
  label,
  value,
  onChange,
  mode = 'date',
  placeholder = 'Selecionar data',
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(() => parseValue(value, mode));
  // Android datetime: primeiro date, depois time
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');

  const filled = !!value;
  const shown = useMemo(() => displayLabel(value, mode), [value, mode]);

  const openPicker = () => {
    setTemp(parseValue(value, mode));
    setAndroidStep('date');
    setOpen(true);
  };

  const commit = (d: Date) => {
    onChange(mode === 'datetime' ? formatDateTimeValue(d) : formatDateValue(d));
  };

  const onNativeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setOpen(false);
        setAndroidStep('date');
        return;
      }
      if (!selected) {
        setOpen(false);
        return;
      }

      if (mode === 'datetime' && androidStep === 'date') {
        setTemp(selected);
        setAndroidStep('time');
        return;
      }

      if (mode === 'datetime' && androidStep === 'time') {
        const merged = new Date(temp);
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        commit(merged);
        setOpen(false);
        setAndroidStep('date');
        return;
      }

      commit(selected);
      setOpen(false);
      return;
    }

    // iOS: só atualiza temp; confirma no botão
    if (selected) setTemp(selected);
  };

  const fieldBg = isDark ? colors.card : colors.surface;
  const chipBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TouchableOpacity
        onPress={openPicker}
        activeOpacity={0.75}
        style={[
          styles.field,
          {
            backgroundColor: fieldBg,
            borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
          },
        ]}
      >
        <View style={[styles.iconChip, { backgroundColor: chipBg }]}>
          <Calendar size={16} color={colors.primary} strokeWidth={2.2} />
        </View>
        <Text
          style={[
            styles.value,
            {
              color: filled ? colors.text : colors.textSecondary,
              fontWeight: filled ? '600' : '500',
            },
          ]}
          numberOfLines={1}
        >
          {shown || placeholder}
        </Text>
        <View style={[styles.iconChip, { backgroundColor: chipBg }]}>
          <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </View>
      </TouchableOpacity>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={temp}
          mode={mode === 'datetime' && androidStep === 'time' ? 'time' : 'date'}
          display="default"
          onChange={onNativeChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          locale="pt-BR"
          accentColor={colors.primary}
          positiveButton={{ label: 'OK', textColor: colors.primary }}
          negativeButton={{ label: 'Cancelar', textColor: colors.textSecondary }}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Pressable
              style={[styles.sheet, { backgroundColor: colors.background }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                  <Text style={[styles.sheetAction, styles.sheetActionLeft, { color: colors.textSecondary }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
                <TouchableOpacity
                  onPress={() => {
                    commit(temp);
                    setOpen(false);
                  }}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.sheetAction,
                      styles.sheetActionRight,
                      { color: colors.primary, fontWeight: '700' },
                    ]}
                  >
                    OK
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={temp}
                mode={mode}
                display="spinner"
                onChange={onNativeChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                locale="pt-BR"
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={colors.primary}
                style={{ alignSelf: 'center' }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  field: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth * 1.5,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    flex: 1,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(120,120,128,0.35)',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetAction: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 72,
  },
  sheetActionLeft: {
    textAlign: 'left',
  },
  sheetActionRight: {
    textAlign: 'right',
  },
});
