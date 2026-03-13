import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, FlatList, Alert, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/context/auth-context';
import { useAttendance } from '@/hooks/use-attendance';
import { apiPost, apiGet } from '@/services/api';
import { useTranslation } from '@/i18n';

interface SessionData { sessionId: number; qrToken: string; numericCode: string; expiresAt: string; }
interface ActiveSessionInfo { id: number; type: 'check_in'|'check_out'; status: string; qr_token: string; numeric_code: string; qr_expires_at: string; employee_count: number; }
interface Employee { id: number; name: string; unique_code: string; phone?: string; check_in_at?: string; check_out_at?: string; duration_minutes?: number; }
interface RecentEmployee { id: number; username: string; phone: string|null; role: string; isCheckedIn: boolean; checkInAt: string|null; }
interface LeaderInfo { id: number; name: string; username: string; }

const phonePath = "M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z";
const smsPath = "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z";

function mapEmp(e: any): Employee {
  return { id: e.employee_id ?? e.id, name: e.employee_name ?? e.name ?? '', unique_code: e.unique_code, phone: e.phone, check_in_at: e.check_in_at, check_out_at: e.check_out_at, duration_minutes: e.duration_minutes };
}

export default function LeaderScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { isCheckedIn, refetch: refetchAttendance } = useAttendance();
  const { t } = useTranslation();

  const [ciSess, setCiSess] = useState<SessionData|null>(null);
  const [coSess, setCoSess] = useState<SessionData|null>(null);
  const [ciEmps, setCiEmps] = useState<Employee[]>([]);
  const [coEmps, setCoEmps] = useState<Employee[]>([]);
  const [viewing, setViewing] = useState<'check_in'|'check_out'|null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [xferType, setXferType] = useState<'check_in'|'check_out'>('check_in');
  const [leaders, setLeaders] = useState<LeaderInfo[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [showEmps, setShowEmps] = useState(false);
  const [recentEmps, setRecentEmps] = useState<RecentEmployee[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const sess = viewing === 'check_in' ? ciSess : coSess;
  const emps = viewing === 'check_in' ? ciEmps : coEmps;

  const fmtDur = (d?: string) => { if (!d) return '—'; const s = Math.floor((Date.now()-new Date(d).getTime())/1000); return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`; };

  const handleCoEmp = (emp: Employee) => {
    Alert.alert(t('leader.checkOutConfirmTitle'), t('leader.checkOutConfirmMsg').replace('{name}', emp.name), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: async () => {
        if (!token) return;
        try {
          const r = await apiPost('/api/attendance/manual-check-out', { employee_id: emp.id }, token);
          if (r.ok) { Alert.alert(t('common.success'), t('leader.checkOutSuccess').replace('{name}', emp.name)); pollAll(); }
          else Alert.alert(t('common.error'), (r.data as any).error ?? t('leader.checkOutFailed'));
        } catch { Alert.alert(t('common.error'), t('common.networkError')); }
      }},
    ]);
  };

  const handleCall = (e: { phone?: string|null }) => { if (e.phone) Linking.openURL(`tel:${e.phone}`); };
  const handleSms = (e: { phone?: string|null }) => { if (e.phone) Linking.openURL(`sms:${e.phone}`); };

  const manualCi = async (e: RecentEmployee) => {
    if (!token) return;
    try {
      const r = await apiPost('/api/attendance/manual-check-in', { employee_id: e.id, reason: 'Pontare manuală' }, token);
      if (r.ok) { Alert.alert(t('common.success'), t('leader.checkOutSuccess').replace('{name}', e.username)); fetchRecent(); }
      else Alert.alert(t('common.error'), (r.data as any).error ?? t('common.error'));
    } catch { Alert.alert(t('common.error'), t('common.networkError')); }
  };

  const manualCo = async (e: RecentEmployee) => {
    if (!token) return;
    try {
      const r = await apiPost('/api/attendance/manual-check-out', { employee_id: e.id, reason: 'Depontare manuală' }, token);
      if (r.ok) { Alert.alert(t('common.success'), t('leader.checkOutSuccess').replace('{name}', e.username)); fetchRecent(); }
      else Alert.alert(t('common.error'), (r.data as any).error ?? t('common.error'));
    } catch { Alert.alert(t('common.error'), t('common.networkError')); }
  };

  const fetchRecent = useCallback(async () => {
    if (!token) return; setLoadingRecent(true);
    try { const r = await apiGet<{employees:RecentEmployee[]}>('/api/attendance/recent-employees?days=5', token); if (r.ok) setRecentEmps(r.data.employees ?? []); }
    catch {} finally { setLoadingRecent(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { refetchAttendance(); }, [refetchAttendance]));

  // Restore active sessions on mount
  useEffect(() => {
    if (!token || !user) return;
    let c = false;
    (async () => {
      try {
        const r = await apiGet<{sessions:ActiveSessionInfo[]}>('/api/sessions?status=active', token);
        if (c || !r.ok) { setRestoring(false); return; }
        for (const s of (r.data.sessions ?? []).filter(s => s.status === 'active')) {
          const d: SessionData = { sessionId: s.id, qrToken: s.qr_token, numericCode: s.numeric_code, expiresAt: s.qr_expires_at };
          if (s.type === 'check_in') setCiSess(d); else setCoSess(d);
        }
        const first = (r.data.sessions ?? []).find(s => s.status === 'active');
        if (first) setViewing(first.type as any);
      } catch {} finally { if (!c) setRestoring(false); }
    })();
    return () => { c = true; };
  }, [token, user]);

  const pollAll = useCallback(async () => {
    if (!token) return;
    if (ciSess) {
      try { const r = await apiGet<{employees:Employee[]}>(`/api/sessions/${ciSess.sessionId}/employees`, token); if (r.ok) setCiEmps((r.data.employees??[]).map(mapEmp)); } catch {}
    }
    if (coSess) {
      try { const r = await apiGet<{employees:Employee[]}>(`/api/sessions/${coSess.sessionId}/employees`, token); if (r.ok) setCoEmps((r.data.employees??[]).map(mapEmp)); } catch {}
    }
  }, [ciSess, coSess, token]);

  useEffect(() => {
    if (ciSess || coSess) { pollAll(); pollRef.current = setInterval(pollAll, 5000); }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [ciSess, coSess, pollAll]);

  const startSession = async (type: 'check_in'|'check_out') => {
    if (!token) return; setLoading(true); setError(null);
    try {
      const r = await apiPost<SessionData>('/api/sessions', { type }, token);
      if (r.ok) { if (type==='check_in') { setCiSess(r.data); setCiEmps([]); } else { setCoSess(r.data); setCoEmps([]); } setViewing(type); }
      else setError((r.data as any).error ?? 'Failed to start session');
    } catch { setError('Network error.'); } finally { setLoading(false); }
  };

  const invalidateQR = async () => {
    if (!sess || !token) return; setLoading(true); setError(null);
    try {
      const r = await apiPost<{qrToken:string;numericCode:string;expiresAt:string}>(`/api/sessions/${sess.sessionId}/invalidate`, {}, token);
      if (r.ok) {
        const u = { ...sess, qrToken: r.data.qrToken, numericCode: r.data.numericCode, expiresAt: r.data.expiresAt };
        if (viewing==='check_in') setCiSess(u); else setCoSess(u);
      } else setError((r.data as any).error ?? 'Failed to regenerate QR');
    } catch { setError('Network error.'); } finally { setLoading(false); }
  };

  const openXfer = async (type: 'check_in'|'check_out') => {
    if (!token) return; setXferType(type); setShowTransfer(true); setLoadingLeaders(true);
    try { const r = await apiGet<{users:LeaderInfo[]}>('/api/users/search?q=&role=leader', token); if (r.ok) setLeaders((r.data.users??[]).filter(l=>l.id!==user?.id)); else setLeaders([]); }
    catch { setLeaders([]); } finally { setLoadingLeaders(false); }
  };

  const doTransfer = async (tid: number) => {
    const s = xferType==='check_in' ? ciSess : coSess;
    if (!s || !token) return; setTransferring(true);
    try {
      const r = await apiPost<{message:string}>(`/api/sessions/${s.sessionId}/transfer`, { targetLeaderId: tid }, token);
      if (r.ok) {
        Alert.alert(t('common.success'), t('leader.transferSuccess')); setShowTransfer(false);
        if (xferType==='check_in') { setCiSess(null); setCiEmps([]); } else { setCoSess(null); setCoEmps([]); }
        if (viewing===xferType) setViewing(null);
      } else Alert.alert(t('common.error'), (r.data as any).error ?? t('leader.transferFailed'));
    } catch { Alert.alert(t('common.error'), t('common.networkError')); } finally { setTransferring(false); }
  };

  const endSession = async (type: 'check_in'|'check_out') => {
    const s = type==='check_in' ? ciSess : coSess;
    const e = type==='check_in' ? ciEmps : coEmps;
    const doEnd = async () => {
      if (s && token) { try { await apiPost(`/api/sessions/${s.sessionId}/end`, {}, token); } catch {} }
      if (type==='check_in') { setCiSess(null); setCiEmps([]); } else { setCoSess(null); setCoEmps([]); }
      if (viewing===type) setViewing(null);
    };
    if (type==='check_out' && e.some(x => !x.check_out_at)) {
      Alert.alert(t('leader.warningEndSession'), t('leader.warningEndSessionMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: 'destructive', onPress: doEnd },
      ]); return;
    }
    await doEnd();
  };

  if (restoring) return <View style={[S.container,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator size="large" color="#007AFF" /></View>;

  const renderCard = (s: SessionData, type: 'check_in'|'check_out', cnt: number) => (
    <TouchableOpacity key={type} style={[S.sessCard, viewing===type && S.sessCardActive, type==='check_in' ? S.sessCardCi : S.sessCardCo]} onPress={() => setViewing(type)} accessibilityRole="button">
      <View style={{flex:1}}>
        <Text style={S.sessCardTitle}>{type==='check_in' ? t('leader.checkInSession') : t('leader.checkOutSession')}</Text>
        <Text style={S.sessCardSub}>#{s.sessionId} · {cnt} angajați</Text>
      </View>
      <TouchableOpacity style={S.sessCardEnd} onPress={() => endSession(type)} accessibilityRole="button"><Text style={S.sessCardEndTxt}>✕</Text></TouchableOpacity>
    </TouchableOpacity>
  );

  const renderDetail = (s: SessionData, type: 'check_in'|'check_out', el: Employee[]) => (
    <>
      <View style={S.qrCard}>
        <Text style={S.qrLabel}>{t('leader.scanQrCode')}</Text>
        <View style={S.qrBox}><QRCode value={s.qrToken} size={200} /></View>
        <Text style={S.numCode}>{s.numericCode}</Text>
        <Text style={S.expires}>Expires: {new Date(s.expiresAt).toLocaleTimeString()}</Text>
      </View>
      <View style={S.actRow}>
        <TouchableOpacity style={S.actBtn} onPress={invalidateQR} disabled={loading} accessibilityRole="button">
          <Text style={S.actBtnTxt}>{loading ? t('leader.generating') : t('leader.newQrCode')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.actBtn} onPress={() => openXfer(type)} accessibilityRole="button">
          <Text style={S.actBtnTxt}>{t('leader.transfer')}</Text>
        </TouchableOpacity>
      </View>
      <View style={S.empSection}>
        <Text style={S.secTitle}>{t('leader.employees').replace('{count}', String(el.length))}</Text>
        {el.length===0 ? <Text style={S.empty}>{t('leader.noEmployeesYet')}</Text> : el.map((emp,i) => (
          <View key={`e-${emp.id}-${i}`} style={S.empRow}>
            <View style={{flex:1}}>
              <Text style={S.empName}>{emp.name}</Text>
              <Text style={S.empCode}>{emp.unique_code}</Text>
              {emp.check_in_at && !emp.check_out_at && <Text style={S.empDur}>{t('leader.workDuration')}: {fmtDur(emp.check_in_at)}</Text>}
            </View>
            <Text style={S.empTime}>{emp.check_in_at ? new Date(emp.check_in_at).toLocaleTimeString() : emp.check_out_at ? new Date(emp.check_out_at).toLocaleTimeString() : ''}</Text>
            <View style={S.empActs}>
              {emp.phone && <TouchableOpacity style={S.callBtn} onPress={() => handleCall(emp)} accessibilityRole="button"><Svg width={18} height={18} viewBox="0 0 24 24"><Path d={phonePath} fill="#007AFF" /></Svg></TouchableOpacity>}
              {!emp.check_out_at && <TouchableOpacity style={S.coEmpBtn} onPress={() => handleCoEmp(emp)} accessibilityRole="button"><Text style={S.coEmpTxt}>{t('leader.checkOutEmployee')}</Text></TouchableOpacity>}
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity style={S.endBtn} onPress={() => endSession(type)} accessibilityRole="button"><Text style={S.endBtnTxt}>{t('leader.endSession')}</Text></TouchableOpacity>
    </>
  );

  return (
    <View style={S.container}>
      <ScrollView contentContainerStyle={S.content}>
        <View style={S.header}><Text style={S.title}>{t('leader.title')}</Text></View>
        {error && <View style={S.errBox}><Text style={S.errTxt}>{error}</Text></View>}

        {ciSess && renderCard(ciSess, 'check_in', ciEmps.length)}
        {coSess && renderCard(coSess, 'check_out', coEmps.length)}

        {(!ciSess || !coSess) && (
          <View style={S.card}>
            <Text style={S.cardTitle}>{t('leader.startSession')}</Text>
            <Text style={S.cardDesc}>{isCheckedIn ? t('leader.startSessionDescCheckedIn') : t('leader.startSessionDescNotCheckedIn')}</Text>
            {!ciSess && <TouchableOpacity style={[S.ciBtn, !isCheckedIn&&{opacity:0.4}]} onPress={() => startSession('check_in')} disabled={loading||!isCheckedIn} accessibilityRole="button">{loading ? <ActivityIndicator color="#fff" /> : <Text style={S.btnTxt}>{t('leader.startCheckInSession')}</Text>}</TouchableOpacity>}
            {!coSess && <TouchableOpacity style={[S.coBtn, !isCheckedIn&&{opacity:0.4}]} onPress={() => startSession('check_out')} disabled={loading||!isCheckedIn} accessibilityRole="button">{loading ? <ActivityIndicator color="#fff" /> : <Text style={S.btnTxt}>{t('leader.startCheckOutSession')}</Text>}</TouchableOpacity>}
          </View>
        )}

        {viewing==='check_in' && ciSess && renderDetail(ciSess, 'check_in', ciEmps)}
        {viewing==='check_out' && coSess && renderDetail(coSess, 'check_out', coEmps)}

        <TouchableOpacity style={S.manualBtn} onPress={() => router.push('/manual-check-in' as any)} accessibilityRole="button"><Text style={S.manualTxt}>{t('leader.manualCheckInOut')}</Text></TouchableOpacity>
        <TouchableOpacity style={S.viewEmpsBtn} onPress={() => { setShowEmps(true); fetchRecent(); }} accessibilityRole="button"><Text style={S.viewEmpsTxt}>{t('leader.viewEmployees')}</Text></TouchableOpacity>
      </ScrollView>

      {/* Transfer Modal */}
      <Modal visible={showTransfer} transparent animationType="slide" onRequestClose={() => setShowTransfer(false)}>
        <View style={S.modalOv}><View style={S.modalC}>
          <Text style={S.modalTitle}>{t('leader.transferLeadership')}</Text>
          <Text style={S.modalDesc}>{t('leader.selectLeaderToTransfer')}</Text>
          {loadingLeaders ? <ActivityIndicator size="large" color="#007AFF" style={{marginVertical:24}} /> : leaders.length===0 ? <Text style={S.empty}>{t('leader.noOtherLeaders')}</Text> : (
            <FlatList data={leaders} keyExtractor={i=>i.id.toString()} style={S.leaderList} renderItem={({item}) => (
              <TouchableOpacity style={S.leaderRow} onPress={() => doTransfer(item.id)} disabled={transferring} accessibilityRole="button">
                <Text style={S.leaderName}>{item.name}</Text><Text style={S.leaderUser}>@{item.username}</Text>
              </TouchableOpacity>
            )} />
          )}
          {transferring && <ActivityIndicator size="small" color="#007AFF" style={{marginTop:12}} />}
          <TouchableOpacity style={S.modalClose} onPress={() => setShowTransfer(false)} accessibilityRole="button"><Text style={S.modalCloseTxt}>{t('leader.cancel')}</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* Recent Employees Modal */}
      <Modal visible={showEmps} transparent animationType="slide" onRequestClose={() => setShowEmps(false)}>
        <View style={S.modalOv}><View style={[S.modalC,{maxHeight:'85%'}]}>
          <View style={S.modalHdr}>
            <Text style={S.modalTitle}>{t('leader.recentEmployees')}</Text>
            <TouchableOpacity style={S.modalX} onPress={() => setShowEmps(false)} accessibilityRole="button"><Text style={S.modalXTxt}>✕</Text></TouchableOpacity>
          </View>
          {loadingRecent ? <ActivityIndicator size="large" color="#007AFF" style={{marginVertical:24}} /> : recentEmps.filter(e=>e.id!==user?.id).length===0 ? <Text style={S.empty}>{t('leader.noRecentEmployees')}</Text> : (
            <FlatList data={recentEmps.filter(e=>e.id!==user?.id)} keyExtractor={i=>i.id.toString()} style={{maxHeight:500}} renderItem={({item}) => (
              <View style={S.recRow}>
                <View style={S.recInfo}><Text style={S.recName}>{item.username}</Text><Text style={S.recPhone}>{item.phone??'—'}</Text></View>
                <View style={S.recActs}>
                  {item.phone && <>
                    <TouchableOpacity style={S.smBtn} onPress={() => handleCall(item)} accessibilityRole="button"><Svg width={16} height={16} viewBox="0 0 24 24"><Path d={phonePath} fill="#28A745" /></Svg></TouchableOpacity>
                    <TouchableOpacity style={S.smBtn} onPress={() => handleSms(item)} accessibilityRole="button"><Svg width={16} height={16} viewBox="0 0 24 24"><Path d={smsPath} fill="#007AFF" /></Svg></TouchableOpacity>
                  </>}
                  {item.isCheckedIn ? <TouchableOpacity style={S.depontBtn} onPress={() => manualCo(item)} accessibilityRole="button"><Text style={S.depontTxt}>{t('leader.checkOutEmployee')}</Text></TouchableOpacity>
                   : <TouchableOpacity style={S.pontBtn} onPress={() => manualCi(item)} accessibilityRole="button"><Text style={S.pontTxt}>{t('leader.checkInEmployee')}</Text></TouchableOpacity>}
                </View>
              </View>
            )} />
          )}
          <TouchableOpacity style={S.modalClose} onPress={() => setShowEmps(false)} accessibilityRole="button"><Text style={S.modalCloseTxt}>{t('leader.cancel')}</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  errBox: { backgroundColor: '#F8D7DA', borderRadius: 8, padding: 16, marginBottom: 16 },
  errTxt: { color: '#721C24', fontSize: 15 },
  sessCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  sessCardActive: { borderColor: '#007AFF' },
  sessCardCi: { backgroundColor: '#D4EDDA' },
  sessCardCo: { backgroundColor: '#F8D7DA' },
  sessCardTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  sessCardSub: { fontSize: 13, color: '#666', marginTop: 2 },
  sessCardEnd: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'center', alignItems: 'center' },
  sessCardEndTxt: { fontSize: 16, fontWeight: '700', color: '#DC3545' },
  card: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: '600', color: '#333', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#666', marginBottom: 20 },
  ciBtn: { backgroundColor: '#28A745', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 12 },
  coBtn: { backgroundColor: '#DC3545', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 4 },
  btnTxt: { color: '#fff', fontSize: 18, fontWeight: '600' },
  manualBtn: { borderWidth: 1, borderColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 12 },
  manualTxt: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  viewEmpsBtn: { backgroundColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
  viewEmpsTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },

  qrCard: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 16 },
  qrLabel: { fontSize: 16, color: '#666', marginBottom: 16 },
  qrBox: { padding: 16, backgroundColor: '#fff', borderRadius: 8, marginBottom: 16 },
  numCode: { fontSize: 36, fontWeight: 'bold', color: '#007AFF', letterSpacing: 4, marginBottom: 8 },
  expires: { fontSize: 13, color: '#999' },
  actRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actBtn: { flex: 1, backgroundColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center' },
  actBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  empSection: { marginTop: 8, marginBottom: 24 },
  secTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 12 },
  empty: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 16 },
  empRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 8, padding: 14, marginBottom: 8 },
  empName: { fontSize: 16, fontWeight: '500', color: '#333' },
  empCode: { fontSize: 13, color: '#666', marginTop: 2 },
  empTime: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  empActs: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  empDur: { fontSize: 12, color: '#28A745', marginTop: 2, fontWeight: '500' },
  callBtn: { backgroundColor: '#E8F4FD', borderRadius: 8, padding: 8, justifyContent: 'center', alignItems: 'center' },
  coEmpBtn: { backgroundColor: '#DC3545', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  coEmpTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  endBtn: { borderWidth: 1, borderColor: '#DC3545', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 32 },
  endBtnTxt: { color: '#DC3545', fontSize: 16, fontWeight: '600' },

  recRow: { backgroundColor: '#F8F9FA', borderRadius: 8, padding: 14, marginBottom: 8 },
  recInfo: { marginBottom: 10 },
  recName: { fontSize: 17, fontWeight: '700', color: '#333' },
  recPhone: { fontSize: 14, color: '#666', marginTop: 2 },
  recActs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smBtn: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 10, justifyContent: 'center', alignItems: 'center' },
  pontBtn: { backgroundColor: '#28A745', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  pontTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  depontBtn: { backgroundColor: '#DC3545', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  depontTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  modalOv: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, maxHeight: '70%' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalX: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  modalXTxt: { fontSize: 18, color: '#333', fontWeight: '600' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', flex: 1 },
  modalDesc: { fontSize: 14, color: '#666', marginBottom: 16 },
  leaderList: { maxHeight: 300 },
  leaderRow: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 16, marginBottom: 8 },
  leaderName: { fontSize: 16, fontWeight: '600', color: '#333' },
  leaderUser: { fontSize: 13, color: '#666', marginTop: 2 },
  modalClose: { marginTop: 16, padding: 14, alignItems: 'center' },
  modalCloseTxt: { color: '#DC3545', fontSize: 16, fontWeight: '600' },
});
