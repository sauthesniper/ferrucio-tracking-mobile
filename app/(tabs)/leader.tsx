import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/context/auth-context';
import { useAttendance } from '@/hooks/use-attendance';
import { apiPost, apiGet } from '@/services/api';

interface SessionData {
  sessionId: number;
  qrToken: string;
  numericCode: string;
  expiresAt: string;
}

interface Employee {
  id: number;
  name: string;
  unique_code: string;
  phone?: string;
  check_in_at?: string;
  check_out_at?: string;
}

interface LeaderInfo {
  id: number;
  name: string;
  username: string;
}

export default function LeaderScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { isCheckedIn, refetch: refetchAttendance } = useAttendance();

  const [session, setSession] = useState<SessionData | null>(null);
  const [sessionType, setSessionType] = useState<'check_in' | 'check_out' | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [selfCheckLoading, setSelfCheckLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [leaders, setLeaders] = useState<LeaderInfo[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refresh attendance status when tab is focused
  useFocusEffect(
    useCallback(() => {
      refetchAttendance();
    }, [refetchAttendance])
  );

  // Poll employees when session is active
  const pollEmployees = useCallback(async () => {
    if (!session || !token) return;
    try {
      const res = await apiGet<{ employees: Employee[] }>(
        `/api/sessions/${session.sessionId}/employees`,
        token,
      );
      if (res.ok) {
        setEmployees(res.data.employees ?? []);
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [session, token]);

  useEffect(() => {
    if (session) {
      pollEmployees();
      pollRef.current = setInterval(pollEmployees, 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [session, pollEmployees]);

  const startSession = async (type: 'check_in' | 'check_out') => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<SessionData>('/api/sessions', { type }, token);
      if (res.ok) {
        setSession(res.data);
        setSessionType(type);
        setEmployees([]);
      } else {
        const errData = res.data as unknown as { error?: string };
        setError(errData.error ?? 'Failed to start session');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const invalidateQR = async () => {
    if (!session || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ qrToken: string; numericCode: string; expiresAt: string }>(
        `/api/sessions/${session.sessionId}/invalidate`,
        {},
        token,
      );
      if (res.ok) {
        setSession((prev) =>
          prev
            ? { ...prev, qrToken: res.data.qrToken, numericCode: res.data.numericCode, expiresAt: res.data.expiresAt }
            : null,
        );
      } else {
        const errData = res.data as unknown as { error?: string };
        setError(errData.error ?? 'Failed to regenerate QR');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openTransferModal = async () => {
    if (!token) return;
    setShowTransferModal(true);
    setLoadingLeaders(true);
    try {
      const res = await apiGet<{ users: LeaderInfo[] }>('/api/users/search?q=&role=leader', token);
      if (res.ok) {
        // Filter out current user
        setLeaders((res.data.users ?? []).filter((l) => l.id !== user?.id));
      } else {
        setLeaders([]);
      }
    } catch {
      setLeaders([]);
    } finally {
      setLoadingLeaders(false);
    }
  };

  const transferLeadership = async (targetLeaderId: number) => {
    if (!session || !token) return;
    setTransferring(true);
    try {
      const res = await apiPost<{ message: string }>(
        `/api/sessions/${session.sessionId}/transfer`,
        { targetLeaderId },
        token,
      );
      if (res.ok) {
        Alert.alert('Success', 'Leadership transferred successfully.');
        setShowTransferModal(false);
        // Clear session since we no longer own it
        setSession(null);
        setSessionType(null);
        setEmployees([]);
      } else {
        const errData = res.data as unknown as { error?: string };
        Alert.alert('Error', errData.error ?? 'Transfer failed');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setTransferring(false);
    }
  };

  const handleSelfCheck = async () => {
    if (!token) return;
    setSelfCheckLoading(true);
    try {
      if (isCheckedIn) {
        const res = await apiPost('/api/attendance/self-check-out', {}, token);
        if (res.ok) {
          await refetchAttendance();
        } else {
          const errData = res.data as unknown as { error?: string };
          Alert.alert('Error', errData.error ?? 'Self check-out failed');
        }
      } else {
        const res = await apiPost('/api/attendance/self-check-in', {}, token);
        if (res.ok) {
          await refetchAttendance();
        } else {
          const errData = res.data as unknown as { error?: string };
          Alert.alert('Error', errData.error ?? 'Self check-in failed');
        }
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setSelfCheckLoading(false);
    }
  };

  const endSession = () => {
    if (employees.length > 0) {
      Alert.alert('Cannot End Session', 'There are still checked-in employees. Check them out first.');
      return;
    }
    setSession(null);
    setSessionType(null);
    setEmployees([]);
  };

  // --- No active session view ---
  if (!session) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Leader Panel</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Start a Session</Text>
          <Text style={styles.cardDesc}>
            {isCheckedIn
              ? 'Create a check-in or check-out session for your team.'
              : 'You must be checked in before starting a session.'}
          </Text>

          <TouchableOpacity
            style={[styles.checkInBtn, !isCheckedIn && { opacity: 0.4 }]}
            onPress={() => startSession('check_in')}
            disabled={loading || !isCheckedIn}
            accessibilityLabel="Start check-in session"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Start Check-In Session</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.checkOutBtn, !isCheckedIn && { opacity: 0.4 }]}
            onPress={() => startSession('check_out')}
            disabled={loading || !isCheckedIn}
            accessibilityLabel="Start check-out session"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Start Check-Out Session</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => router.push('/manual-check-in' as any)}
          accessibilityLabel="Manual check-in or check-out"
          accessibilityRole="button"
        >
          <Text style={styles.manualBtnText}>Manual Check-In / Check-Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[isCheckedIn ? styles.checkOutBtn : styles.checkInBtn, selfCheckLoading && { opacity: 0.6 }]}
          onPress={handleSelfCheck}
          disabled={selfCheckLoading}
          accessibilityLabel={isCheckedIn ? 'Self check-out' : 'Self check-in'}
          accessibilityRole="button"
        >
          {selfCheckLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{isCheckedIn ? 'Self Check-Out' : 'Self Check-In'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // --- Active session view ---
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {sessionType === 'check_in' ? 'Check-In Session' : 'Check-Out Session'}
          </Text>
          <Text style={styles.subtitle}>Session #{session.sessionId}</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* QR Code */}
        <View style={styles.qrCard}>
          <Text style={styles.qrLabel}>Scan this QR code</Text>
          <View style={styles.qrContainer}>
            <QRCode value={session.qrToken} size={220} />
          </View>
          <Text style={styles.numericCode}>{session.numericCode}</Text>
          <Text style={styles.expiresText}>
            Expires: {new Date(session.expiresAt).toLocaleTimeString()}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={invalidateQR}
            disabled={loading}
            accessibilityLabel="Generate new QR code"
            accessibilityRole="button"
          >
            <Text style={styles.actionBtnText}>
              {loading ? 'Generating...' : 'New QR Code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={openTransferModal}
            accessibilityLabel="Transfer leadership"
            accessibilityRole="button"
          >
            <Text style={styles.actionBtnText}>Transfer</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => router.push('/manual-check-in' as any)}
          accessibilityLabel="Manual check-in or check-out"
          accessibilityRole="button"
        >
          <Text style={styles.manualBtnText}>Manual Check-In / Check-Out</Text>
        </TouchableOpacity>

        {/* Employee list */}
        <View style={styles.employeeSection}>
          <Text style={styles.sectionTitle}>
            Employees ({employees.length})
          </Text>
          {employees.length === 0 ? (
            <Text style={styles.emptyText}>No employees yet. Waiting for scans...</Text>
          ) : (
            employees.map((emp, idx) => (
              <View key={`emp-${emp.id}-${idx}`} style={styles.employeeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.employeeName}>{emp.name}</Text>
                  <Text style={styles.employeeCode}>{emp.unique_code}</Text>
                </View>
                <Text style={styles.employeeTime}>
                  {emp.check_in_at
                    ? new Date(emp.check_in_at).toLocaleTimeString()
                    : emp.check_out_at
                      ? new Date(emp.check_out_at).toLocaleTimeString()
                      : ''}
                </Text>
                {emp.phone ? (
                  <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/contact' as any,
                        params: { name: emp.name, phone: emp.phone },
                      })
                    }
                    accessibilityLabel={`Contact ${emp.name}`}
                    accessibilityRole="button"
                  >
                    <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" fill="#007AFF" /></Svg>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[isCheckedIn ? styles.endSessionBtn : styles.checkInBtn, selfCheckLoading && { opacity: 0.6 }]}
          onPress={handleSelfCheck}
          disabled={selfCheckLoading}
          accessibilityLabel={isCheckedIn ? 'Self check-out' : 'Self check-in'}
          accessibilityRole="button"
        >
          {selfCheckLoading ? (
            <ActivityIndicator color={isCheckedIn ? '#DC3545' : '#fff'} />
          ) : (
            <Text style={isCheckedIn ? styles.endSessionBtnText : styles.btnText}>
              {isCheckedIn ? 'Self Check-Out' : 'Self Check-In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endSessionBtn}
          onPress={endSession}
          accessibilityLabel="End session"
          accessibilityRole="button"
        >
          <Text style={styles.endSessionBtnText}>End Session</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Transfer Leadership Modal */}
      <Modal
        visible={showTransferModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTransferModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Transfer Leadership</Text>
            <Text style={styles.modalDesc}>Select a leader to transfer this session to:</Text>

            {loadingLeaders ? (
              <ActivityIndicator size="large" color="#007AFF" style={{ marginVertical: 24 }} />
            ) : leaders.length === 0 ? (
              <Text style={styles.emptyText}>No other leaders available.</Text>
            ) : (
              <FlatList
                data={leaders}
                keyExtractor={(item) => item.id.toString()}
                style={styles.leaderList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.leaderRow}
                    onPress={() => transferLeadership(item.id)}
                    disabled={transferring}
                    accessibilityLabel={`Transfer to ${item.name}`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.leaderName}>{item.name}</Text>
                    <Text style={styles.leaderUsername}>@{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
            )}

            {transferring && (
              <ActivityIndicator size="small" color="#007AFF" style={{ marginTop: 12 }} />
            )}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowTransferModal(false)}
              accessibilityLabel="Cancel transfer"
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },

  errorBox: { backgroundColor: '#F8D7DA', borderRadius: 8, padding: 16, marginBottom: 16 },
  errorText: { color: '#721C24', fontSize: 15 },

  card: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: '600', color: '#333', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#666', marginBottom: 20 },

  checkInBtn: {
    backgroundColor: '#28A745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  checkOutBtn: {
    backgroundColor: '#DC3545',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },

  manualBtn: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  manualBtnText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },

  qrCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  qrLabel: { fontSize: 16, color: '#666', marginBottom: 16 },
  qrContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 16,
  },
  numericCode: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    letterSpacing: 4,
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  expiresText: { fontSize: 13, color: '#999' },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  employeeSection: { marginTop: 8, marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 16 },

  employeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  employeeName: { fontSize: 16, fontWeight: '500', color: '#333' },
  employeeCode: { fontSize: 13, color: '#666', marginTop: 2 },
  employeeTime: { fontSize: 14, color: '#007AFF', fontWeight: '500' },

  contactBtn: {
    marginLeft: 8,
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactBtnText: { fontSize: 18 },

  endSessionBtn: {
    borderWidth: 1,
    borderColor: '#DC3545',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 32,
  },
  endSessionBtnText: { color: '#DC3545', fontSize: 16, fontWeight: '600' },

  // Transfer modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  modalDesc: { fontSize: 14, color: '#666', marginBottom: 16 },
  leaderList: { maxHeight: 300 },
  leaderRow: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  leaderName: { fontSize: 16, fontWeight: '600', color: '#333' },
  leaderUsername: { fontSize: 13, color: '#666', marginTop: 2 },
  modalCloseBtn: {
    marginTop: 16,
    padding: 14,
    alignItems: 'center',
  },
  modalCloseBtnText: { color: '#DC3545', fontSize: 16, fontWeight: '600' },
});
