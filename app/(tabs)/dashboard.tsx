import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Linking,
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/context/auth-context';
import { useAttendance } from '@/hooks/use-attendance';
import { useTelemetry } from '@/hooks/use-telemetry';
import { apiGet, apiPost } from '@/services/api';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from '@/i18n';

interface LeaderInfo {
  id: number;
  username: string;
  phone: string | null;
}

interface DashboardData {
  lastWorkDay: string | null;
  totalHoursThisMonth: number;
  hoursWorkedToday: number;
  isCheckedIn: boolean;
  leader: LeaderInfo | null;
  checkedInCount?: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { isCheckedIn, currentSession, loading: statusLoading, refetch } = useAttendance();
  const { t } = useTranslation();
  const isEmployee = user?.role === 'employee';

  useTelemetry(isCheckedIn, currentSession?.id ?? null);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selfLoading, setSelfLoading] = useState(false);
  const [selfSuccess, setSelfSuccess] = useState<string | null>(null);
  const [selfError, setSelfError] = useState<string | null>(null);

  const isLeader = user?.role === 'leader';

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiGet<DashboardData>('/api/attendance/dashboard', token);
      if (res.ok) {
        setDashboard(res.data);
        setError(null);
      } else {
        const errData = res.data as unknown as { error?: string };
        setError(errData.error ?? 'Failed to load dashboard');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchDashboard(), refetch()]);
    setRefreshing(false);
  }, [fetchDashboard, refetch]);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
      refetch();
    }, [fetchDashboard, refetch])
  );

  useEffect(() => { fetchDashboard(); }, [isCheckedIn]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { fetchDashboard(); refetch(); }
    });
    return () => sub.remove();
  }, [fetchDashboard, refetch]);

  const handleCheckIn = () => router.push('/qr-scanner' as any);
  const handleCheckOut = () => router.push('/qr-scanner' as any);

  const handleSelfCheckIn = async () => {
    setSelfLoading(true);
    setSelfSuccess(null);
    setSelfError(null);
    try {
      const res = await apiPost<{ attendanceId?: number; error?: string }>(
        '/api/attendance/self-check-in',
        {},
        token
      );
      if (res.ok) {
        setSelfSuccess('Pontare intrare reușită!');
        await refetch();
        await fetchDashboard();
      } else {
        setSelfError(res.data?.error ?? 'Eroare la pontare intrare');
      }
    } catch (e: unknown) {
      setSelfError(e instanceof Error ? e.message : 'Eroare de rețea');
    } finally {
      setSelfLoading(false);
    }
  };

  const handleSelfCheckOut = async () => {
    setSelfLoading(true);
    setSelfSuccess(null);
    setSelfError(null);
    try {
      const res = await apiPost<{ error?: string }>(
        '/api/attendance/self-check-out',
        {},
        token
      );
      if (res.ok) {
        setSelfSuccess('Pontare ieșire reușită!');
        await refetch();
        await fetchDashboard();
      } else {
        setSelfError(res.data?.error ?? 'Eroare la pontare ieșire');
      }
    } catch (e: unknown) {
      setSelfError(e instanceof Error ? e.message : 'Eroare de rețea');
    } finally {
      setSelfLoading(false);
    }
  };

  if (loading || statusLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('dashboard.loading')}</Text>
        </View>
      </View>
    );
  }

  // ─── EMPLOYEE: simple view ───
  if (isEmployee) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentCentered}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('dashboard.welcome').replace('{name}', user?.username ?? '')}</Text>
          <TouchableOpacity
            style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
            onPress={refreshAll}
            disabled={refreshing}
            accessibilityLabel="Refresh"
            accessibilityRole="button"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="#fff" />
              </Svg>
            )}
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Simple status card */}
        <View style={[styles.statusCard, isCheckedIn ? styles.statusCheckedIn : styles.statusCheckedOut]}>
          <Text style={styles.statusText}>
            {isCheckedIn ? t('dashboard.checkedIn') : t('dashboard.checkedOut')}
          </Text>
        </View>

        {/* Check-in / Check-out button */}
        <TouchableOpacity
          style={[styles.bigActionBtn, isCheckedIn ? styles.bigActionOut : styles.bigActionIn]}
          onPress={isCheckedIn ? handleCheckOut : handleCheckIn}
          accessibilityLabel={isCheckedIn ? 'Check out' : 'Check in'}
          accessibilityRole="button"
        >
          <Text style={styles.bigActionText}>
            {isCheckedIn ? t('dashboard.checkOut') : t('dashboard.checkIn')}
          </Text>
        </TouchableOpacity>

        {/* Leader contact */}
        {dashboard?.leader && (
          <View style={styles.leaderSection}>
            <Text style={styles.leaderLabel}>{t('dashboard.yourLeader')}: {dashboard.leader.username}</Text>
            {dashboard.leader.phone && (
              <View style={styles.leaderButtons}>
                <TouchableOpacity
                  style={styles.leaderCallBtn}
                  onPress={() => Linking.openURL(`tel:${dashboard.leader!.phone}`)}
                  accessibilityLabel={t('dashboard.callLeader')}
                  accessibilityRole="button"
                >
                  <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" fill="#fff" /></Svg>
                  <Text style={styles.leaderBtnText}>{t('dashboard.callLeader')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.leaderMsgBtn}
                  onPress={() => Linking.openURL(`sms:${dashboard.leader!.phone}`)}
                  accessibilityLabel={t('dashboard.messageLeader')}
                  accessibilityRole="button"
                >
                  <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" fill="#fff" /></Svg>
                  <Text style={styles.leaderBtnText}>{t('dashboard.messageLeader')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── LEADER / ADMIN: full dashboard ───
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('dashboard.welcome').replace('{name}', user?.username ?? '')}</Text>
        <TouchableOpacity
          style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
          onPress={refreshAll}
          disabled={refreshing}
          accessibilityLabel="Refresh dashboard"
          accessibilityRole="button"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="#fff" />
            </Svg>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={[styles.statusCard, isCheckedIn ? styles.statusCheckedIn : styles.statusCheckedOut]}>
        <Text style={styles.statusText}>
          {isCheckedIn ? t('dashboard.checkedIn') : t('dashboard.checkedOut')}
        </Text>
      </View>

      {dashboard?.checkedInCount != null && (
        <View style={styles.checkedInCountCard}>
          <Text style={styles.checkedInCountLabel}>{t('dashboard.checkedInEmployees')}</Text>
          <Text style={styles.checkedInCountValue}>{dashboard.checkedInCount}</Text>
        </View>
      )}

      {isCheckedIn && dashboard?.leader && user?.role !== 'leader' && user?.role !== 'admin' && (
        <View style={styles.leaderCard}>
          <Text style={styles.leaderTitle}>{t('dashboard.yourLeader')}</Text>
          <Text style={styles.leaderNameAdmin}>{dashboard.leader.username}</Text>
          {dashboard.leader.phone && (
            <TouchableOpacity
              style={styles.callBtnGreen}
              onPress={() => Linking.openURL(`tel:${dashboard.leader!.phone}`)}
            >
              <Text style={styles.callBtnText}>{dashboard.leader.phone}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('dashboard.hoursThisMonth')}</Text>
          <Text style={styles.statValue}>
            {dashboard ? `${Math.floor(dashboard.totalHoursThisMonth)}h ${Math.round((dashboard.totalHoursThisMonth % 1) * 60)}m` : '—'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('dashboard.hoursToday')}</Text>
          <Text style={styles.statValue}>
            {dashboard ? `${Math.floor(dashboard.hoursWorkedToday)}h ${Math.round((dashboard.hoursWorkedToday % 1) * 60)}m` : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.actionsContainer}>
        {selfSuccess && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{selfSuccess}</Text>
          </View>
        )}
        {selfError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{selfError}</Text>
          </View>
        )}
        {!isCheckedIn ? (
          <TouchableOpacity
            style={[styles.checkInBtn, selfLoading && styles.btnDisabled]}
            onPress={isLeader ? handleSelfCheckIn : handleCheckIn}
            disabled={selfLoading}
            accessibilityRole="button"
          >
            {selfLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>{t('dashboard.checkIn')}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.checkOutBtn, selfLoading && styles.btnDisabled]}
            onPress={isLeader ? handleSelfCheckOut : handleCheckOut}
            disabled={selfLoading}
            accessibilityRole="button"
          >
            {selfLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>{t('dashboard.checkOut')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60 },
  contentCentered: { padding: 24, paddingTop: 60, flexGrow: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  refreshBtn: { backgroundColor: '#007AFF', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  refreshBtnDisabled: { opacity: 0.6 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 16, color: '#666' },
  errorBox: { backgroundColor: '#F8D7DA', borderRadius: 8, padding: 16, marginBottom: 16 },
  errorText: { color: '#721C24', fontSize: 15 },

  // Employee action buttons
  bigActionBtn: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 24 },
  bigActionIn: { backgroundColor: '#28A745' },
  bigActionOut: { backgroundColor: '#DC3545' },
  bigActionText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  leaderSection: { backgroundColor: '#FFF8E1', borderRadius: 12, padding: 20, marginBottom: 16 },
  leaderLabel: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  leaderButtons: { flexDirection: 'row', gap: 12 },
  leaderCallBtn: { flex: 1, backgroundColor: '#28A745', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  leaderMsgBtn: { flex: 1, backgroundColor: '#007AFF', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  leaderBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Leader/Admin view
  statusCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 16, marginBottom: 16 },
  statusCheckedIn: { backgroundColor: '#D4EDDA' },
  statusCheckedOut: { backgroundColor: '#F0F0F0' },
  statusText: { fontSize: 16, fontWeight: '600', color: '#333' },
  checkedInCountCard: { backgroundColor: '#E8F4FD', borderRadius: 8, padding: 16, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkedInCountLabel: { fontSize: 15, color: '#333', fontWeight: '500' },
  checkedInCountValue: { fontSize: 24, fontWeight: 'bold', color: '#007AFF' },
  leaderCard: { backgroundColor: '#FFF8E1', borderRadius: 8, padding: 16, marginBottom: 16 },
  leaderTitle: { fontSize: 13, color: '#666', marginBottom: 4 },
  leaderNameAdmin: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  callBtnGreen: { backgroundColor: '#28A745', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', alignSelf: 'flex-start' },
  callBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#F0F0F0', borderRadius: 8, padding: 16 },
  statLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '600', color: '#333' },
  actionsContainer: { marginTop: 16 },
  checkInBtn: { backgroundColor: '#28A745', borderRadius: 8, padding: 16, alignItems: 'center' },
  checkOutBtn: { backgroundColor: '#DC3545', borderRadius: 8, padding: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  successBox: { backgroundColor: '#D4EDDA', borderRadius: 8, padding: 16, marginBottom: 12 },
  successText: { color: '#155724', fontSize: 15 },
});
