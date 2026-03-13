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
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/context/auth-context';
import { useAttendance } from '@/hooks/use-attendance';
import { apiPost, apiGet } from '@/services/api';
import { useTranslation } from '@/i18n';

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
  duration_minutes?: number;
}

interface RecentEmployee {
  id: number;
  username: string;
  phone: string | null;
  role: string;
  isCheckedIn: boolean;
  checkInAt: string | null;
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
  const { t } = useTranslation();

  const [session, setSession] = useState<SessionData | null>(null);
  const [sessionType, setSessionType] = useState<'check_in' | 'check_out' | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [leaders, setLeaders] = useState<LeaderInfo[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // Recent employees modal state
  const [showEmployeesModal, setShowEmployeesModal] = useState(false);
  const [recentEmployees, setRecentEmployees] = useState<RecentEmployee[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Session restore state
  const [restoringSession, setRestoringSession] = useState(false);
  const [pendingActiveSession, setPendingActiveSession] = useState<{
    id: number;
    type: 'check_in' | 'check_out';
    qr_token: string;
    numeric_code: string;
    qr_expires_at: string;
  } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatWorkDuration = (checkInAt?: string): string => {
    if (!checkInAt) return '—';
    const checkInTime = new Date(checkInAt).getTime();
    const now = Date.now();
    const totalSeconds = Math.floor((now - checkInTime) / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const handleCheckOutEmployee = (emp: Employee) => {
    Alert.alert(
      t('leader.checkOutConfirmTitle'),
      t('leader.checkOutConfirmMsg').replace('{name}', emp.name),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              const res = await apiPost('/api/attendance/manual-check-out', { employee_id: emp.id }, token);
              if (res.ok) {
                Alert.alert(t('common.success'), t('leader.checkOutSuccess').replace('{name}', emp.name));
                pollEmployees();
              } else {
                const errData = res.data as unknown as { error?: string };
                Alert.alert(t('common.error'), errData.error ?? t('leader.checkOutFailed'));
              }
            } catch {
              Alert.alert(t('common.error'), t('common.networkError'));
            }
          },
        },
      ]
    );
  };

  const handleCallEmployee = (emp: { phone?: string | null }) => {
    if (emp.phone) Linking.openURL(`tel:${emp.phone}`);
  };

  const handleSmsEmployee = (emp: { phone?: string | null }) => {
    if (emp.phone) Linking.openURL(`sms:${emp.phone}`);
  };

  // Manual check-in for a recent employee
  const handleManualCheckIn = async (emp: RecentEmployee) => {
    if (!token) return;
    try {
      const res = await apiPost('/api/attendance/manual-check-in', { employee_id: emp.id, reason: 'Pontare manuală din lista angajați' }, token);
      if (res.ok) {
        Alert.alert(t('common.success'), t('leader.checkOutSuccess').replace('{name}', emp.username));
        fetchRecentEmployees();
      } else {
        const errData = res.data as unknown as { error?: string };
        Alert.alert(t('common.error'), errData.error ?? t('common.error'));
      }
    } catch {
      Alert.alert(t('common.error'), t('common.networkError'));
    }
  };

  // Manual check-out for a recent employee
  const handleManualCheckOut = async (emp: RecentEmployee) => {
    if (!token) return;
    try {
      const res = await apiPost('/api/attendance/manual-check-out', { employee_id: emp.id, reason: 'Depontare manuală din lista angajați' }, token);
      if (res.ok) {
        Alert.alert(t('common.success'), t('leader.checkOutSuccess').replace('{name}', emp.username));
        fetchRecentEmployees();
      } else {
        const errData = res.data as unknown as { error?: string };
        Alert.alert(t('common.error'), errData.error ?? t('common.error'));
      }
    } catch {
      Alert.alert(t('common.error'), t('common.networkError'));
    }
  };

  const fetchRecentEmployees = useCallback(async () => {
    if (!token) return;
    setLoadingRecent(true);
    try {
      const res = await apiGet<{ employees: RecentEmployee[] }>('/api/attendance/recent-employees?days=5', token);
      if (res.ok) {
        setRecentEmployees(res.data.employees ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoadingRecent(false); }
  }, [token]);

  const openEmployeesModal = () => {
    setShowEmployeesModal(true);
    fetchRecentEmployees();
  };

  useFocusEffect(
    useCallback(() => {
      refetchAttendance();
    }, [refetchAttendance])
  );

  // Check for active session on mount (session restore)
  useEffect(() => {
    if (!token || !user) return;
    // Don't check if we already have a session active in state
    if (session) return;

    let cancelled = false;

    const checkActiveSession = async () => {
      try {
        const res = await apiGet<{ sessions: Array<{
          id: number;
          leader_id: number;
          type: 'check_in' | 'check_out';
          qr_token: string;
          numeric_code: string;
          qr_expires_at: string;
          status: string;
        }> }>('/api/sessions?status=active', token);

        if (cancelled) return;

        if (res.ok && res.data.sessions?.length > 0) {
          // Find the first active session belonging to this leader
          const activeSession = res.data.sessions.find(s => s.leader_id === user.id);
          if (activeSession) {
            setPendingActiveSession(activeSession);
          }
        }
      } catch {
        // Silently fail — show normal create buttons
      }
    };

    checkActiveSession();
    return () => { cancelled = true; };
  }, [token, user, session]);

  const pollEmployees = useCallback(async () => {
    if (!session || !token) return;
    try {
      const res = await apiGet<{ employees: Employee[] }>(
        `/api/sessions/${session.sessionId}/employees`,
        token,
      );
      if (res.ok) {
        const mapped = (res.data.employees ?? []).map((e: any) => ({
          id: e.employee_id ?? e.id,
          name: e.employee_name ?? e.name ?? '',
          unique_code: e.unique_code,
          phone: e.phone,
          check_in_at: e.check_in_at,
          check_out_at: e.check_out_at,
          duration_minutes: e.duration_minutes,
        }));
        setEmployees(mapped);
      }
    } catch { /* ignore */ }
  }, [session, token]);

  useEffect(() => {
    if (session) {
      pollEmployees();
      pollRef.current = setInterval(pollEmployees, 5000);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [session, pollEmployees]);

  const restoreActiveSession = async () => {
    if (!pendingActiveSession || !token) return;
    setRestoringSession(true);
    setError(null);
    try {
      const s = pendingActiveSession;
      const isQrExpired = new Date(s.qr_expires_at).getTime() < Date.now();

      if (isQrExpired) {
        // Auto-regenerate QR via invalidate endpoint
        const res = await apiPost<{ qrToken: string; numericCode: string; expiresAt: string; sessionId: number }>(
          `/api/sessions/${s.id}/invalidate`,
          {},
          token,
        );
        if (res.ok) {
          setSession({
            sessionId: s.id,
            qrToken: res.data.qrToken,
            numericCode: res.data.numericCode,
            expiresAt: res.data.expiresAt,
          });
        } else {
          // Even if invalidate fails, still restore with old data
          setSession({
            sessionId: s.id,
            qrToken: s.qr_token,
            numericCode: s.numeric_code,
            expiresAt: s.qr_expires_at,
          });
        }
      } else {
        setSession({
          sessionId: s.id,
          qrToken: s.qr_token,
          numericCode: s.numeric_code,
          expiresAt: s.qr_expires_at,
        });
      }
      setSessionType(s.type);
      setPendingActiveSession(null);
    } catch {
      setError('Failed to restore session.');
    } finally {
      setRestoringSession(false);
    }
  };

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
        Alert.alert(t('common.success'), t('leader.transferSuccess'));
        setShowTransferModal(false);
        setSession(null);
        setSessionType(null);
        setEmployees([]);
      } else {
        const errData = res.data as unknown as { error?: string };
        Alert.alert(t('common.error'), errData.error ?? t('leader.transferFailed'));
      }
    } catch {
      Alert.alert(t('common.error'), t('common.networkError'));
    } finally {
      setTransferring(false);
    }
  };

  const endSession = async () => {
    const doEnd = async () => {
      if (session && token) {
        try {
          await apiPost(`/api/sessions/${session.sessionId}/end`, {}, token);
        } catch { /* still clear local state even if API fails */ }
      }
      setSession(null);
      setSessionType(null);
      setEmployees([]);
      setPendingActiveSession(null);
    };

    if (sessionType === 'check_out' && employees.some(e => !e.check_out_at)) {
      Alert.alert(t('leader.warningEndSession'), t('leader.warningEndSessionMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: doEnd,
        },
      ]);
      return;
    }
    await doEnd();
  };

  // Phone icon SVG path
  const phonePath = "M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z";
  const smsPath = "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z";

  // --- Recent Employees Modal ---
  const renderEmployeesModal = () => (
    <Modal
      visible={showEmployeesModal}
      transparent
      animationType="slide"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: '85%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('leader.recentEmployees')}</Text>
            <TouchableOpacity
              style={styles.modalCloseX}
              onPress={() => setShowEmployeesModal(false)}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseXText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loadingRecent ? (
            <ActivityIndicator size="large" color="#007AFF" style={{ marginVertical: 24 }} />
          ) : recentEmployees.filter(e => e.id !== user?.id).length === 0 ? (
            <Text style={styles.emptyText}>{t('leader.noRecentEmployees')}</Text>
          ) : (
            <FlatList
              data={recentEmployees.filter(e => e.id !== user?.id)}
              keyExtractor={(item) => item.id.toString()}
              style={{ maxHeight: 500 }}
              renderItem={({ item }) => (
                <View style={styles.recentEmpRow}>
                  <View style={styles.recentEmpInfo}>
                    <Text style={styles.recentEmpName}>{item.username}</Text>
                    <Text style={styles.recentEmpPhone}>{item.phone ?? '—'}</Text>
                  </View>
                  <View style={styles.recentEmpActions}>
                    {item.phone ? (
                      <>
                        <TouchableOpacity
                          style={styles.smallActionBtn}
                          onPress={() => handleCallEmployee(item)}
                          accessibilityLabel={t('leader.callEmployeeBtn')}
                          accessibilityRole="button"
                        >
                          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d={phonePath} fill="#28A745" /></Svg>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.smallActionBtn}
                          onPress={() => handleSmsEmployee(item)}
                          accessibilityLabel={t('leader.smsEmployee')}
                          accessibilityRole="button"
                        >
                          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d={smsPath} fill="#007AFF" /></Svg>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    {item.isCheckedIn ? (
                      <TouchableOpacity
                        style={styles.depontBtn}
                        onPress={() => handleManualCheckOut(item)}
                        accessibilityLabel={t('leader.checkOutEmployee')}
                        accessibilityRole="button"
                      >
                        <Text style={styles.depontBtnText}>{t('leader.checkOutEmployee')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.pontBtn}
                        onPress={() => handleManualCheckIn(item)}
                        accessibilityLabel={t('leader.checkInEmployee')}
                        accessibilityRole="button"
                      >
                        <Text style={styles.pontBtnText}>{t('leader.checkInEmployee')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            />
          )}

          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setShowEmployeesModal(false)}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Text style={styles.modalCloseBtnText}>{t('leader.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // --- No active session view ---
  if (!session) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('leader.title')}</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {pendingActiveSession ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {t('leader.activeSessionFound')}
            </Text>
            <TouchableOpacity
              style={styles.restoreSessionBtn}
              onPress={restoreActiveSession}
              disabled={restoringSession}
              accessibilityLabel="View active session"
              accessibilityRole="button"
            >
              {restoringSession ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>
                  {t('leader.viewActiveSession').replace(
                    '{type}',
                    pendingActiveSession.type === 'check_in' ? 'check-in' : 'check-out'
                  )}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('leader.startSession')}</Text>
          <Text style={styles.cardDesc}>
            {isCheckedIn
              ? t('leader.startSessionDescCheckedIn')
              : t('leader.startSessionDescNotCheckedIn')}
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
              <Text style={styles.btnText}>{t('leader.startCheckInSession')}</Text>
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
              <Text style={styles.btnText}>{t('leader.startCheckOutSession')}</Text>
            )}
          </TouchableOpacity>
        </View>
        )}

        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => router.push('/manual-check-in' as any)}
          accessibilityLabel="Manual check-in or check-out"
          accessibilityRole="button"
        >
          <Text style={styles.manualBtnText}>{t('leader.manualCheckInOut')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewEmployeesBtn}
          onPress={openEmployeesModal}
          accessibilityLabel={t('leader.viewEmployees')}
          accessibilityRole="button"
        >
          <Text style={styles.viewEmployeesBtnText}>{t('leader.viewEmployees')}</Text>
        </TouchableOpacity>

        {renderEmployeesModal()}
      </ScrollView>
    );
  }

  // --- Active session view ---
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {sessionType === 'check_in' ? t('leader.checkInSession') : t('leader.checkOutSession')}
          </Text>
          <Text style={styles.subtitle}>{t('leader.sessionNumber').replace('{id}', String(session.sessionId))}</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* QR Code */}
        <View style={styles.qrCard}>
          <Text style={styles.qrLabel}>{t('leader.scanQrCode')}</Text>
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
              {loading ? t('leader.generating') : t('leader.newQrCode')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={openTransferModal}
            accessibilityLabel="Transfer leadership"
            accessibilityRole="button"
          >
            <Text style={styles.actionBtnText}>{t('leader.transfer')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => router.push('/manual-check-in' as any)}
          accessibilityLabel="Manual check-in or check-out"
          accessibilityRole="button"
        >
          <Text style={styles.manualBtnText}>{t('leader.manualCheckInOut')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewEmployeesBtn}
          onPress={openEmployeesModal}
          accessibilityLabel={t('leader.viewEmployees')}
          accessibilityRole="button"
        >
          <Text style={styles.viewEmployeesBtnText}>{t('leader.viewEmployees')}</Text>
        </TouchableOpacity>

        {/* Employee list */}
        <View style={styles.employeeSection}>
          <Text style={styles.sectionTitle}>
            {t('leader.employees').replace('{count}', String(employees.length))}
          </Text>
          <Text style={styles.checkedInTotal}>
            {t('leader.checkedInTotal').replace('{count}', String(employees.filter(e => !e.check_out_at).length))}
          </Text>
          {employees.length === 0 ? (
            <Text style={styles.emptyText}>{t('leader.noEmployeesYet')}</Text>
          ) : (
            employees.map((emp, idx) => (
              <View key={`emp-${emp.id}-${idx}`} style={styles.employeeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.employeeName}>{emp.name}</Text>
                  <Text style={styles.employeeCode}>{emp.unique_code}</Text>
                  {emp.check_in_at && !emp.check_out_at && (
                    <Text style={styles.employeeDuration}>
                      {t('leader.workDuration')}: {formatWorkDuration(emp.check_in_at)}
                    </Text>
                  )}
                </View>
                <Text style={styles.employeeTime}>
                  {emp.check_in_at
                    ? new Date(emp.check_in_at).toLocaleTimeString()
                    : emp.check_out_at
                      ? new Date(emp.check_out_at).toLocaleTimeString()
                      : ''}
                </Text>
                <View style={styles.employeeActions}>
                  {emp.phone ? (
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => handleCallEmployee(emp)}
                      accessibilityLabel={t('leader.callEmployee') + ` ${emp.name}`}
                      accessibilityRole="button"
                    >
                      <Svg width={18} height={18} viewBox="0 0 24 24"><Path d={phonePath} fill="#007AFF" /></Svg>
                    </TouchableOpacity>
                  ) : null}
                  {!emp.check_out_at && (
                    <TouchableOpacity
                      style={styles.checkOutEmployeeBtn}
                      onPress={() => handleCheckOutEmployee(emp)}
                      accessibilityLabel={t('leader.checkOutEmployee') + ` ${emp.name}`}
                      accessibilityRole="button"
                    >
                      <Text style={styles.checkOutEmployeeBtnText}>{t('leader.checkOutEmployee')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={styles.endSessionBtn}
          onPress={endSession}
          accessibilityLabel="End session"
          accessibilityRole="button"
        >
          <Text style={styles.endSessionBtnText}>{t('leader.endSession')}</Text>
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
            <Text style={styles.modalTitle}>{t('leader.transferLeadership')}</Text>
            <Text style={styles.modalDesc}>{t('leader.selectLeaderToTransfer')}</Text>

            {loadingLeaders ? (
              <ActivityIndicator size="large" color="#007AFF" style={{ marginVertical: 24 }} />
            ) : leaders.length === 0 ? (
              <Text style={styles.emptyText}>{t('leader.noOtherLeaders')}</Text>
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
              <Text style={styles.modalCloseBtnText}>{t('leader.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {renderEmployeesModal()}
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

  checkInBtn: { backgroundColor: '#28A745', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 12 },
  checkOutBtn: { backgroundColor: '#DC3545', borderRadius: 8, padding: 16, alignItems: 'center' },
  restoreSessionBtn: { backgroundColor: '#007AFF', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },

  manualBtn: { borderWidth: 1, borderColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 12 },
  manualBtnText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },

  viewEmployeesBtn: { backgroundColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
  viewEmployeesBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  qrCard: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 16 },
  qrLabel: { fontSize: 16, color: '#666', marginBottom: 16 },
  qrContainer: { padding: 16, backgroundColor: '#fff', borderRadius: 8, marginBottom: 16 },
  numericCode: { fontSize: 36, fontWeight: 'bold', color: '#007AFF', letterSpacing: 4, marginBottom: 8, fontVariant: ['tabular-nums'] },
  expiresText: { fontSize: 13, color: '#999' },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionBtn: { flex: 1, backgroundColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  employeeSection: { marginTop: 8, marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 16 },

  employeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 8, padding: 14, marginBottom: 8 },
  employeeName: { fontSize: 16, fontWeight: '500', color: '#333' },
  employeeCode: { fontSize: 13, color: '#666', marginTop: 2 },
  employeeTime: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  employeeActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  employeeDuration: { fontSize: 12, color: '#28A745', marginTop: 2, fontWeight: '500' },
  checkedInTotal: { fontSize: 14, color: '#007AFF', fontWeight: '600', marginBottom: 12 },
  callBtn: { backgroundColor: '#E8F4FD', borderRadius: 8, padding: 8, justifyContent: 'center', alignItems: 'center' },
  checkOutEmployeeBtn: { backgroundColor: '#DC3545', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  checkOutEmployeeBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  endSessionBtn: { borderWidth: 1, borderColor: '#DC3545', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 32 },
  endSessionBtnText: { color: '#DC3545', fontSize: 16, fontWeight: '600' },

  // Recent employees modal
  recentEmpRow: { backgroundColor: '#F8F9FA', borderRadius: 8, padding: 14, marginBottom: 8 },
  recentEmpInfo: { marginBottom: 10 },
  recentEmpName: { fontSize: 17, fontWeight: '700', color: '#333' },
  recentEmpPhone: { fontSize: 14, color: '#666', marginTop: 2 },
  recentEmpActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallActionBtn: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 10, justifyContent: 'center', alignItems: 'center' },
  pontBtn: { backgroundColor: '#28A745', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  pontBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  depontBtn: { backgroundColor: '#DC3545', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  depontBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalCloseX: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  modalCloseXText: { fontSize: 18, color: '#333', fontWeight: '600' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', flex: 1 },
  modalDesc: { fontSize: 14, color: '#666', marginBottom: 16 },
  leaderList: { maxHeight: 300 },
  leaderRow: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 16, marginBottom: 8 },
  leaderName: { fontSize: 16, fontWeight: '600', color: '#333' },
  leaderUsername: { fontSize: 13, color: '#666', marginTop: 2 },
  modalCloseBtn: { marginTop: 16, padding: 14, alignItems: 'center' },
  modalCloseBtnText: { color: '#DC3545', fontSize: 16, fontWeight: '600' },
});
