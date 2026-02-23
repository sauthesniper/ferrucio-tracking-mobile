import { useState, useEffect, useRef, useCallback } from 'react';
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
import { apiGet } from '@/services/api';
import Svg, { Path } from 'react-native-svg';

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

  // Start/stop telemetry collection based on attendance state
  useTelemetry(isCheckedIn, currentSession?.id ?? null);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Live timer state (seconds elapsed today)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Refresh every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
      refetch();
    }, [fetchDashboard, refetch])
  );

  // Also refresh whenever check-in status changes
  useEffect(() => {
    fetchDashboard();
  }, [isCheckedIn]);

  // Auto-refresh when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchDashboard();
        refetch();
      }
    });
    return () => sub.remove();
  }, [fetchDashboard, refetch]);

  // Live timer: tick every second while checked in
  useEffect(() => {
    if (isCheckedIn && currentSession) {
      const checkInTime = new Date(currentSession.checkInAt).getTime();
      const updateElapsed = () => {
        const now = Date.now();
        setElapsedSeconds(Math.floor((now - checkInTime) / 1000));
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
    } else {
      setElapsedSeconds(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isCheckedIn, currentSession]);

  const formatDuration = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatHours = (hours: number): string => {
    if (hours == null || isNaN(hours)) return '0h 0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const handleCheckIn = () => {
    router.push('/qr-scanner' as any);
  };

  const handleCheckOut = () => {
    router.push('/qr-scanner' as any);
  };

  if (loading || statusLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
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

      {/* Profile section */}
      <View style={styles.profileCard}>
        <Text style={styles.profileName}>{user?.username ?? 'Employee'}</Text>
        <Text style={styles.profileRole}>{user?.role ?? ''}</Text>
      </View>

      {/* Status indicator */}
      <View style={[styles.statusCard, isCheckedIn ? styles.statusCheckedIn : styles.statusCheckedOut]}>
        <View style={[styles.statusDot, isCheckedIn ? styles.dotActive : styles.dotInactive]} />
        <Text style={styles.statusText}>
          {isCheckedIn ? 'Checked In — Working' : 'Checked Out'}
        </Text>
      </View>

      {/* Leader: checked-in employee count */}
      {(user?.role === 'leader' || user?.role === 'admin') && dashboard?.checkedInCount != null && (
        <View style={styles.checkedInCountCard}>
          <Text style={styles.checkedInCountLabel}>Checked-In Employees</Text>
          <Text style={styles.checkedInCountValue}>{dashboard.checkedInCount}</Text>
        </View>
      )}

      {/* Leader info when checked in (only for non-leader roles) */}
      {isCheckedIn && dashboard?.leader && user?.role !== 'leader' && user?.role !== 'admin' && (
        <View style={styles.leaderCard}>
          <Text style={styles.leaderTitle}>Your Leader</Text>
          <Text style={styles.leaderName}>{dashboard.leader.username}</Text>
          {dashboard.leader.phone && (
            <TouchableOpacity
              style={styles.callBtn}
              onPress={() => Linking.openURL(`tel:${dashboard.leader!.phone}`)}
              accessibilityLabel={`Call leader ${dashboard.leader.username}`}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" fill="#fff" /></Svg>
                <Text style={styles.callBtnText}>{dashboard.leader.phone}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Live timer when checked in */}
      {isCheckedIn && (
        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>Time Working Today</Text>
          <Text style={styles.timerValue}>{formatDuration(elapsedSeconds)}</Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Last Work Day</Text>
          <Text style={styles.statValue}>
            {dashboard?.lastWorkDay ?? '—'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Hours This Month</Text>
          <Text style={styles.statValue}>
            {dashboard ? formatHours(dashboard.totalHoursThisMonth) : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Hours Today</Text>
          <Text style={styles.statValue}>
            {dashboard ? formatHours(dashboard.hoursWorkedToday) : '—'}
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionsContainer}>
        {!isCheckedIn ? (
          <TouchableOpacity
            style={styles.checkInBtn}
            onPress={handleCheckIn}
            accessibilityLabel="Check in"
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Check In</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.checkOutBtn}
            onPress={handleCheckOut}
            accessibilityLabel="Check out"
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Check Out</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  refreshBtn: { backgroundColor: '#007AFF', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  refreshBtnDisabled: { opacity: 0.6 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 16, color: '#666' },
  errorBox: { backgroundColor: '#F8D7DA', borderRadius: 8, padding: 16, marginBottom: 16 },
  errorText: { color: '#721C24', fontSize: 15 },

  profileCard: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 16, marginBottom: 16 },
  profileName: { fontSize: 20, fontWeight: '600', color: '#333' },
  profileRole: { fontSize: 14, color: '#666', marginTop: 4, textTransform: 'capitalize' },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  statusCheckedIn: { backgroundColor: '#D4EDDA' },
  statusCheckedOut: { backgroundColor: '#F0F0F0' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  dotActive: { backgroundColor: '#28A745' },
  dotInactive: { backgroundColor: '#999' },
  statusText: { fontSize: 16, fontWeight: '600', color: '#333' },

  leaderCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },

  checkedInCountCard: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkedInCountLabel: { fontSize: 15, color: '#333', fontWeight: '500' },
  checkedInCountValue: { fontSize: 24, fontWeight: 'bold', color: '#007AFF' },
  leaderTitle: { fontSize: 13, color: '#666', marginBottom: 4 },
  leaderName: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  callBtn: {
    backgroundColor: '#28A745',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  callBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  timerCard: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  timerLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  timerValue: { fontSize: 36, fontWeight: 'bold', color: '#007AFF', fontVariant: ['tabular-nums'] },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 16,
  },
  statLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '600', color: '#333' },

  actionsContainer: { marginTop: 16 },
  checkInBtn: {
    backgroundColor: '#28A745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  checkOutBtn: {
    backgroundColor: '#DC3545',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
