import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/context/auth-context';
import { apiGet, apiPost } from '@/services/api';
import { useTranslation } from '@/i18n';

type Mode = 'check_in' | 'check_out';

interface SearchResult {
  id: number;
  name: string;
  username: string;
  phone: string;
  unique_code: string;
}

export default function ManualCheckInScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useTranslation();

  const [mode, setMode] = useState<Mode>('check_in');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<SearchResult | null>(null);

  // Form fields
  const [reason, setReason] = useState('');
  const [startTime, setStartTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const searchEmployees = useCallback(
    async (q: string) => {
      if (!token || q.trim().length < 1) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await apiGet<{ users: SearchResult[] }>(
          `/api/users/search?q=${encodeURIComponent(q.trim())}`,
          token,
        );
        if (res.ok) {
          setResults(res.data.users ?? []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [token],
  );

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setSelectedEmployee(null);
    setError(null);
    setSuccess(null);
    // Debounced search — trigger on every change for simplicity
    searchEmployees(text);
  };

  const selectEmployee = (emp: SearchResult) => {
    setSelectedEmployee(emp);
    setQuery(emp.name);
    setResults([]);
  };

  const handleSubmit = async () => {
    if (!selectedEmployee || !token) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'check_in') {
        const body: Record<string, unknown> = {
          employee_id: selectedEmployee.id,
          reason: reason || undefined,
        };
        if (startTime.trim()) {
          body.start_time = startTime.trim();
        }
        const res = await apiPost<{ attendanceId: number }>(
          '/api/attendance/manual-check-in',
          body,
          token,
        );
        if (res.ok) {
          setSuccess(t('manualCheckIn.checkInRecorded').replace('{name}', selectedEmployee.name));
          resetForm();
        } else {
          const errData = res.data as unknown as { error?: string };
          setError(errData.error ?? t('manualCheckIn.failedCheckIn'));
        }
      } else {
        const body: Record<string, unknown> = {
          employee_id: selectedEmployee.id,
          reason: reason || undefined,
        };
        const res = await apiPost<{ message: string; duration: number }>(
          '/api/attendance/manual-check-out',
          body,
          token,
        );
        if (res.ok) {
          const mins = res.data.duration;
          const h = Math.floor(mins / 60);
          const m = Math.round(mins % 60);
          setSuccess(
            t('manualCheckIn.checkOutRecorded').replace('{name}', selectedEmployee.name).replace('{duration}', `${h}h ${m}m`),
          );
          resetForm();
        } else {
          const errData = res.data as unknown as { error?: string };
          setError(errData.error ?? t('manualCheckIn.failedCheckOut'));
        }
      }
    } catch {
      setError(t('manualCheckIn.networkError'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedEmployee(null);
    setQuery('');
    setReason('');
    setStartTime('');
    setResults([]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backText}>{t('manualCheckIn.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{mode === 'check_in' ? t('manualCheckIn.title') : t('manualCheckIn.titleCheckOut')}</Text>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'check_in' && styles.modeBtnActive]}
          onPress={() => { setMode('check_in'); setError(null); setSuccess(null); }}
          accessibilityLabel="Check-in mode"
          accessibilityRole="button"
        >
          <Text style={[styles.modeBtnText, mode === 'check_in' && styles.modeBtnTextActive]}>
            {t('manualCheckIn.checkInMode')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'check_out' && styles.modeBtnActive]}
          onPress={() => { setMode('check_out'); setError(null); setSuccess(null); }}
          accessibilityLabel="Check-out mode"
          accessibilityRole="button"
        >
          <Text style={[styles.modeBtnText, mode === 'check_out' && styles.modeBtnTextActive]}>
            {t('manualCheckIn.checkOutMode')}
          </Text>
        </TouchableOpacity>
      </View>

      {success && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{success}</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Search field */}
      <Text style={styles.label}>{t('manualCheckIn.searchEmployee')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('manualCheckIn.searchPlaceholder')}
        placeholderTextColor="#999"
        value={query}
        onChangeText={handleQueryChange}
        autoCapitalize="none"
        accessibilityLabel={t('manualCheckIn.searchEmployee')}
      />

      {/* Search results */}
      {searching && <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 8 }} />}
      {results.length > 0 && (
        <View style={styles.resultsList}>
          {results.map((emp) => (
            <TouchableOpacity
              key={emp.id}
              style={styles.resultRow}
              onPress={() => selectEmployee(emp)}
              accessibilityLabel={`Select ${emp.name}`}
              accessibilityRole="button"
            >
              <Text style={styles.resultName}>{emp.name}</Text>
              <Text style={styles.resultDetail}>
                {emp.phone} · {emp.unique_code}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Selected employee */}
      {selectedEmployee && (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedLabel}>{t('manualCheckIn.selectedEmployee')}</Text>
          <Text style={styles.selectedName}>{selectedEmployee.name}</Text>
          <Text style={styles.selectedDetail}>
            {selectedEmployee.phone} · {selectedEmployee.unique_code}
          </Text>
          {selectedEmployee.phone ? (
            <TouchableOpacity
              style={styles.contactLink}
              onPress={() =>
                router.push({
                  pathname: '/contact' as any,
                  params: { name: selectedEmployee.name, phone: selectedEmployee.phone },
                })
              }
              accessibilityLabel={`Contact ${selectedEmployee.name}`}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" fill="#007AFF" /></Svg>
                <Text style={styles.contactLinkText}>{t('manualCheckIn.contact')}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Start time (check-in only) */}
      {mode === 'check_in' && (
        <>
          <Text style={styles.label}>{t('manualCheckIn.startTime')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('manualCheckIn.startTimePlaceholder')}
            placeholderTextColor="#999"
            value={startTime}
            onChangeText={setStartTime}
            accessibilityLabel={t('manualCheckIn.startTime')}
          />
        </>
      )}

      {/* Reason */}
      <Text style={styles.label}>{t('manualCheckIn.reason')}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder={t('manualCheckIn.reasonPlaceholder')}
        placeholderTextColor="#999"
        value={reason}
        onChangeText={setReason}
        multiline
        numberOfLines={3}
        accessibilityLabel={t('manualCheckIn.reason')}
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, !selectedEmployee && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!selectedEmployee || submitting}
        accessibilityLabel={mode === 'check_in' ? t('manualCheckIn.submitCheckIn') : t('manualCheckIn.submitCheckOut')}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>
            {mode === 'check_in' ? t('manualCheckIn.submitCheckIn') : t('manualCheckIn.submitCheckOut')}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60 },
  header: { marginBottom: 24 },
  backText: { color: '#007AFF', fontSize: 17, fontWeight: '600', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },

  modeRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: '#007AFF' },
  modeBtnText: { fontSize: 15, fontWeight: '600', color: '#007AFF' },
  modeBtnTextActive: { color: '#fff' },

  successBox: { backgroundColor: '#D4EDDA', borderRadius: 8, padding: 16, marginBottom: 16 },
  successText: { color: '#155724', fontSize: 15 },
  errorBox: { backgroundColor: '#F8D7DA', borderRadius: 8, padding: 16, marginBottom: 16 },
  errorText: { color: '#721C24', fontSize: 15 },

  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  resultsList: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  resultRow: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  resultName: { fontSize: 16, fontWeight: '500', color: '#333' },
  resultDetail: { fontSize: 13, color: '#666', marginTop: 2 },

  selectedCard: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  selectedLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  selectedName: { fontSize: 18, fontWeight: '600', color: '#333' },
  selectedDetail: { fontSize: 13, color: '#666', marginTop: 2 },

  contactLink: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  contactLinkText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },

  submitBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
