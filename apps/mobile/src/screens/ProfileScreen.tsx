import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Mail, Briefcase, Calendar, LogOut, MapPin, CreditCard } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  
  const styles = getStyles(colors);

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', onPress: logout },
    ]);
  };

  return (
    <View style={styles.safeArea}>
      <SafeAreaView edges={['top']} style={styles.topSafeArea} />
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <User size={48} color="#fff" />
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.role}>
            {user?.employee?.position || user?.role || 'Funcionário'}
          </Text>
        </View>

        {/* Informações Pessoais */}
        
        {user?.employee && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informações</Text>

            <View style={styles.infoCard}>
              <View style={styles.infoItem}>
                <Mail size={20} color={colors.primary} />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{user?.email || '-'}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoItem}>
                <User size={20} color={colors.primary} />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>CPF</Text>
                  <Text style={styles.infoValue}>{user?.cpf || '-'}</Text>
                </View>
              </View>

              {user?.employee?.birthDate && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoItem}>
                    <Calendar size={20} color={colors.primary} />
                    <View style={styles.infoText}>
                      <Text style={styles.infoLabel}>Data de Nascimento</Text>
                      <Text style={styles.infoValue}>
                        {new Date(user.employee.birthDate).toLocaleDateString('pt-BR')}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.divider} />

              <View style={styles.infoItem}>
                <Briefcase size={20} color={colors.primary} />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Setor</Text>
                  <Text style={styles.infoValue}>{user.employee.department}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoItem}>
                <CreditCard size={20} color={colors.primary} />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Matrícula</Text>
                  <Text style={styles.infoValue}>{user.employee.employeeId}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoItem}>
                <Calendar size={20} color={colors.primary} />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Data de Admissão</Text>
                  <Text style={styles.infoValue}>
                    {new Date(user.employee.hireDate).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
              </View>

              {user.employee.company && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoItem}>
                    <Briefcase size={20} color={colors.primary} />
                    <View style={styles.infoText}>
                      <Text style={styles.infoLabel}>Empresa</Text>
                      <Text style={styles.infoValue}>{user.employee.company}</Text>
                    </View>
                  </View>
                </>
              )}

              {user.employee.polo && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoItem}>
                    <MapPin size={20} color={colors.primary} />
                    <View style={styles.infoText}>
                      <Text style={styles.infoLabel}>Polo</Text>
                      <Text style={styles.infoValue}>{user.employee.polo}</Text>
                    </View>
                  </View>
                </>
              )}

              {user.employee.modality && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoItem}>
                    <Briefcase size={20} color={colors.primary} />
                    <View style={styles.infoText}>
                      <Text style={styles.infoLabel}>Modalidade</Text>
                      <Text style={styles.infoValue}>{user.employee.modality}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Botão de Sair */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color="#ffffff" />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topSafeArea: {
    backgroundColor: colors.headerBackground,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.headerBackground,
    paddingVertical: 40,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 20,
    elevation: 3,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  role: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    elevation: 0,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoText: {
    marginLeft: 16,
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
  logoutButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ce3736',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    elevation: 0,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

