import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { Gavel, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import type { RootStackParamList } from '../../App';

type DayPayload = { date: string; label: string; total: number };
type SemanaPayload = {
  monday?: string;
  friday?: string;
  days?: DayPayload[];
};

type ChartRow = {
  label: string;
  atual: number;
  anterior: number;
  dateLabel: string;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function shiftYmd(dateStr: string, deltaDays: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + deltaDays);
  return toYmd(date);
}

function resolveMondayYmd(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  const dow = date.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + offset);
  return toYmd(date);
}

function formatWeekRange(monday: string, friday: string) {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };
  return `${fmt(monday)} – ${fmt(friday)}`;
}

function formatDayMonthShort(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

export default function PncpCaptacoesCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);
  const today = toYmd(new Date());
  const currentWeekMonday = resolveMondayYmd(today);
  const [weekMonday, setWeekMonday] = useState(currentWeekMonday);
  const [chartWidth, setChartWidth] = useState(0);
  const canGoNext = weekMonday < currentWeekMonday;
  const prevMonday = shiftYmd(weekMonday, -7);

  const { data, isLoading } = useQuery({
    queryKey: ['pncp-meus-envios-semana-compare', weekMonday],
    staleTime: 30_000,
    queryFn: async () => {
      const [atualRes, anteriorRes] = await Promise.all([
        api.get(`/api/pncp/meus-envios-semana?weekStart=${weekMonday}`),
        api.get(`/api/pncp/meus-envios-semana?weekStart=${prevMonday}`),
      ]);
      const atualJson = await atualRes.json();
      const anteriorJson = await anteriorRes.json();
      if (!atualRes.ok) {
        throw new Error(atualJson?.message || 'Erro ao carregar captações');
      }
      return {
        atual: (atualJson?.data ?? atualJson) as SemanaPayload,
        anterior: (anteriorJson?.data ?? anteriorJson) as SemanaPayload,
      };
    },
  });

  const chartData: ChartRow[] = useMemo(() => {
    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'] as const;
    const atualDays = data?.atual?.days;
    const anteriorDays = data?.anterior?.days;
    return labels.map((label, i) => {
      const atual = atualDays?.[i];
      const date = atual?.date || shiftYmd(weekMonday, i);
      return {
        label,
        atual: Number(atual?.total || 0),
        anterior: Number(anteriorDays?.[i]?.total || 0),
        dateLabel: formatDayMonthShort(date),
      };
    });
  }, [data, weekMonday]);

  const friday = data?.atual?.friday || shiftYmd(weekMonday, 4);
  const barAtual = colors.primary;
  const barAnterior = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.14)';
  const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const tick = colors.textSecondary;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - chartWidth) > 1) setChartWidth(w);
  };

  const chartHeight = 150;
  const padTop = 8;
  const padBottom = 32;
  const padLeft = 22;
  const padRight = 4;
  const plotH = chartHeight - padTop - padBottom;
  const plotW = Math.max(chartWidth - padLeft - padRight, 0);
  const maxVal = Math.max(4, ...chartData.flatMap((d) => [d.atual, d.anterior]));
  const yTicks = [0, Math.ceil(maxVal / 2), maxVal];
  const groupW = plotW / Math.max(chartData.length, 1);
  const barW = Math.min(12, groupW * 0.26);
  const gap = 3;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Gavel size={20} color={colors.primary} strokeWidth={2.1} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Captações</Text>
          <Text style={styles.subtitle}>Envios PNCP na semana</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Pncp')}
          style={styles.openBtn}
          hitSlop={10}
          accessibilityLabel="Abrir licitações PNCP"
        >
          <ExternalLink size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: barAnterior }]} />
            <Text style={styles.legendText}>Anterior</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: barAtual }]} />
            <Text style={styles.legendText}>Esta semana</Text>
          </View>
        </View>

        <View style={styles.weekNav}>
          <TouchableOpacity
            onPress={() => setWeekMonday((d) => shiftYmd(d, -7))}
            activeOpacity={0.7}
            style={styles.navBtn}
            accessibilityLabel="Semana anterior"
          >
            <ChevronLeft size={18} color={colors.text} strokeWidth={2.2} />
          </TouchableOpacity>
          <Text style={styles.weekLabel} numberOfLines={1}>
            {formatWeekRange(weekMonday, friday)}
          </Text>
          <TouchableOpacity
            disabled={!canGoNext}
            onPress={() =>
              setWeekMonday((d) => {
                const next = shiftYmd(d, 7);
                return next > currentWeekMonday ? currentWeekMonday : next;
              })
            }
            activeOpacity={0.7}
            style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
            accessibilityLabel="Próxima semana"
          >
            <ChevronRight size={18} color={colors.text} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chartWrap} onLayout={onLayout}>
        {isLoading || chartWidth < 40 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Svg width={chartWidth} height={chartHeight}>
            {yTicks.map((t) => {
              const y = padTop + plotH - (t / maxVal) * plotH;
              return (
                <React.Fragment key={`y-${t}`}>
                  <Line
                    x1={padLeft}
                    x2={chartWidth - padRight}
                    y1={y}
                    y2={y}
                    stroke={grid}
                    strokeWidth={StyleSheet.hairlineWidth * 1.5}
                  />
                  <SvgText
                    x={padLeft - 6}
                    y={y + 3}
                    fill={tick}
                    fontSize={10}
                    fontWeight="600"
                    textAnchor="end"
                  >
                    {String(t)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {chartData.map((row, i) => {
              const cx = padLeft + groupW * i + groupW / 2;
              const hAnt = (row.anterior / maxVal) * plotH;
              const hAtual = (row.atual / maxVal) * plotH;
              const xAnt = cx - barW - gap / 2;
              const xAtual = cx + gap / 2;
              const yAnt = padTop + plotH - Math.max(hAnt, 1.5);
              const yAtual = padTop + plotH - Math.max(hAtual, 1.5);

              return (
                <React.Fragment key={row.label}>
                  <Rect
                    x={xAnt}
                    y={yAnt}
                    width={barW}
                    height={Math.max(hAnt, 1.5)}
                    fill={barAnterior}
                    rx={5}
                  />
                  <Rect
                    x={xAtual}
                    y={yAtual}
                    width={barW}
                    height={Math.max(hAtual, 1.5)}
                    fill={barAtual}
                    rx={5}
                  />
                  <SvgText
                    x={cx}
                    y={chartHeight - 16}
                    fill={colors.text}
                    fontSize={11}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {row.label}
                  </SvgText>
                  <SvgText
                    x={cx}
                    y={chartHeight - 4}
                    fill={tick}
                    fontSize={9}
                    fontWeight="500"
                    textAnchor="middle"
                  >
                    {row.dateLabel}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 18,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.06)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    openBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controls: {
      gap: 10,
      marginBottom: 12,
    },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingLeft: 2,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    weekNav: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 14,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15, 23, 42, 0.08)',
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.card : colors.surface,
    },
    navBtnDisabled: { opacity: 0.35 },
    weekLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.2,
      paddingHorizontal: 8,
    },
    chartWrap: { width: '100%', minHeight: 150 },
    loading: {
      height: 150,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
