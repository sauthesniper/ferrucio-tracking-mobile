import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useAttendance } from '@/hooks/use-attendance';
import { useLocationTracking } from '@/hooks/use-location-tracking';
import { apiPost } from '@/services/api';
import { useTranslation, t } from '@/i18n';
import {
  formatNumericCode,
  isCompleteCode,
  stripCodeFormatting,
} from '@/utils/numeric-code';

type SubmitResult =
  | { kind: 'check-in'; numericCode: string }
  | { kind: 'check-out'; durationMinutes: number };

export default function ManualCodeInputScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { isCheckedIn, refetch } = useAttendance();
  const { latitude, longitude } = useLocationTracking();
  const { t } = useTranslation();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCodeChange = (text: string) => {
    setCode(formatNumericCode(text));
  };

  const handleSubmit = async () => {
    if (!isCompleteCode(code) || submitting) return;

    setSubmitting(true);
    setError(null);

    const numericCode = stripCodeFormatting(code);

    try {
      if (isCheckedIn) {
        const res = await apiPost<{
          attendanceId: number;
          checkOutAt: string;
          durationMinutes: number;
        }>('/api/attendance/check-out-code', { numericCode, latitude, longitude }, token);

        if (res.ok) {
          setResult({ kind: 'check-out', durationMinutes: res.data.durationMinutes });
          await refetch();
        } else {
          const errData = res.data as unknown as { error?: string; code?: string };
          setError(mapErrorMessage(errData));
          setCode('');
        }
      } else {
        const res = await apiPost<{ attendanceId: number; numericCode: string }>(
          '/api/attendance/check-in-code',
          { numericCode, latitude, longitude },
          token,
        );

        if (res.ok) {
          setResult({ kind: 'check-in', numericCode: code });
          await refetch();
        } else {
          const errData = res.data as unknown as { error?: string; code?: string };
          setError(mapErrorMessage(errData));
          setCode('');
        }
      }
    } catch {
      setError(t('manualCode.networkError'));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  // --- Success state ---
  if (result) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          {result.kind === 'check-in' ? (
            <>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>{t('qrScanner.checkedIn')}</Text>
              <Text style={styles.codeLabel}>{t('qrScanner.yourCode')}</Text>
              <Text style={styles.numericCode}>{result.numericCode}</Text>
            </>
          ) : (
            <>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>{t('qrScanner.checkedOut')}</Text>
              <Text style={styles.durationLabel}>{t('qrScanner.duration')}</Text>
              <Text style={styles.durationValue}>
                {formatDuration(result.durationMinutes)}
              </Text>
            </>
          )}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleBack}
            accessibilityLabel={t('qrScanner.backToDashboard')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>{t('qrScanner.backToDashboard')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Input state ---
  return (
    <View style={styles.container}>
      <View style={styles.centeredContent}>
        <Text style={styles.title}>
          {isCheckedIn ? t('manualCode.enterCodeCheckOut') : t('manualCode.enterCodeCheckIn')}
        </Text>

        <Text style={styles.hint}>
          {t('manualCode.hint')}
        </Text>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={handleCodeChange}
          keyboardType="number-pad"
          placeholder={t('manualCode.placeholder')}
          placeholderTextColor="#999"
          maxLength={7}
          accessibilityLabel={t('manualCode.enterCodeCheckIn')}
          editable={!submitting}
          autoFocus
        />

        {error && <Text style={styles.errorMessage}>{error}</Text>}

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            (!isCompleteCode(code) || submitting) && styles.disabledBtn,
          ]}
          onPress={handleSubmit}
          disabled={!isCompleteCode(code) || submitting}
          accessibilityLabel="Submit code"
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('manualCode.submit')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleBack}
          accessibilityLabel={t('qrScanner.back')}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>{t('qrScanner.back')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Helpers ---

function mapErrorMessage(errData: { error?: string; code?: string }): string {
  switch (errData.code) {
    case 'OUTSIDE_GREEN_ZONE':
      return t('geofence.outsideZone');
    case 'MISSING_GPS_COORDINATES':
      return t('geofence.missingGps');
    case 'INVALID_NUMERIC_CODE':
      return t('manualCode.invalidCode');
    case 'QR_EXPIRED':
      return t('manualCode.codeExpired');
    case 'ACTIVE_SESSION_EXISTS':
      return t('manualCode.alreadyCheckedIn');
    case 'NO_ACTIVE_SESSION':
      return t('manualCode.noActiveSession');
    default:
      return errData.error ?? t('manualCode.somethingWrong');
  }
}

function formatDuration(minutes: number): string {
  if (minutes == null || isNaN(minutes)) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },

  title: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 12 },

  hint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },

  codeInput: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 200,
    marginBottom: 24,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },

  errorMessage: {
    fontSize: 14,
    color: '#DC3545',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },

  // Success states (matching qr-scanner.tsx)
  successIcon: { fontSize: 64, color: '#28A745', marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 24 },
  codeLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  numericCode: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
    letterSpacing: 4,
    marginBottom: 32,
    fontVariant: ['tabular-nums'],
  },
  durationLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  durationValue: { fontSize: 36, fontWeight: 'bold', color: '#007AFF', marginBottom: 32 },

  // Buttons (matching qr-scanner.tsx)
  primaryBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  disabledBtn: { opacity: 0.5 },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
});
