import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '@/context/auth-context';
import { useAttendance } from '@/hooks/use-attendance';
import { apiPost } from '@/services/api';

type ScanResult =
  | { kind: 'check-in'; numericCode: string; attendanceId: number }
  | { kind: 'check-out'; message: string; duration: number };

export default function QRScannerScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { isCheckedIn, refetch } = useAttendance();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prevent duplicate scans while processing
  const processingRef = useRef(false);

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (processingRef.current || !scanning) return;
    processingRef.current = true;
    setScanning(false);
    setSubmitting(true);
    setError(null);

    try {
      const qrToken = data;

      if (isCheckedIn) {
        // Check-out flow
        const res = await apiPost<{ attendanceId: number; checkOutAt: string; durationMinutes: number }>(
          '/api/attendance/check-out',
          { qrToken },
          token,
        );
        if (res.ok) {
          setResult({ kind: 'check-out', message: 'Checked out', duration: res.data.durationMinutes });
          await refetch();
        } else {
          const errData = res.data as unknown as { error?: string; code?: string };
          setError(mapErrorMessage(errData));
        }
      } else {
        // Check-in flow
        const res = await apiPost<{ attendanceId: number; numericCode: string }>(
          '/api/attendance/check-in',
          { qrToken },
          token,
        );
        if (res.ok) {
          setResult({
            kind: 'check-in',
            numericCode: res.data.numericCode,
            attendanceId: res.data.attendanceId,
          });
          await refetch();
        } else {
          const errData = res.data as unknown as { error?: string; code?: string };
          setError(mapErrorMessage(errData));
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
      processingRef.current = false;
    }
  };

  const handleRetry = () => {
    setError(null);
    setResult(null);
    setScanning(true);
  };

  const handleBack = () => {
    router.back();
  };

  // --- Permission states ---

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan QR codes for check-in and check-out.
          </Text>
          {permission.canAskAgain ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={requestPermission}
              accessibilityLabel="Grant camera permission"
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.permissionText}>
              Please enable camera access in your device settings.
            </Text>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/manual-code-input' as any)}
            accessibilityLabel="Enter code manually"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Enter code manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Result state ---

  if (result) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          {result.kind === 'check-in' ? (
            <>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Checked In</Text>
              <Text style={styles.codeLabel}>Your Code</Text>
              <Text style={styles.numericCode}>{result.numericCode}</Text>
              <Text style={styles.codeHint}>Show this code to your leader for confirmation</Text>
            </>
          ) : (
            <>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Checked Out</Text>
              <Text style={styles.durationLabel}>Duration</Text>
              <Text style={styles.durationValue}>{formatDuration(result.duration)}</Text>
            </>
          )}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleBack}
            accessibilityLabel="Back to dashboard"
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Error state ---

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleRetry}
            accessibilityLabel="Try scanning again"
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Scan Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Scanner state ---

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.overlayTitle}>
            {isCheckedIn ? 'Scan QR to Check Out' : 'Scan QR to Check In'}
          </Text>
        </View>

        <View style={styles.scanFrame} />

        <View style={styles.overlayBottom}>
          {submitting && (
            <View style={styles.submittingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submittingText}>Processing...</Text>
            </View>
          )}
          <Text style={styles.overlayHint}>
            Point your camera at the QR code displayed by your leader
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/manual-code-input' as any)}
            accessibilityLabel="Enter code manually"
            accessibilityRole="button"
            style={styles.manualEntryBtn}
          >
            <Text style={styles.manualEntryText}>Enter code manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// --- Helpers ---

function mapErrorMessage(errData: { error?: string; code?: string }): string {
  const code = errData.code;
  if (code === 'QR_EXPIRED' || errData.error?.toLowerCase().includes('expired')) {
    return 'This QR code has expired. Ask your leader to generate a new one.';
  }
  if (code === 'ALREADY_CHECKED_IN' || errData.error?.toLowerCase().includes('already')) {
    return 'You are already checked in. Check out first before checking in again.';
  }
  if (code === 'NO_ACTIVE_SESSION' || errData.error?.toLowerCase().includes('no active')) {
    return 'No active attendance session found. Please check in first.';
  }
  return errData.error ?? 'Something went wrong. Please try again.';
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

  // Permission & result screens
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  permissionTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  permissionText: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },

  // Success states
  successIcon: {
    fontSize: 64,
    color: '#28A745',
    marginBottom: 16,
  },
  successTitle: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 24 },
  codeLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  numericCode: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
    letterSpacing: 4,
    marginBottom: 12,
    fontVariant: ['tabular-nums'],
  },
  codeHint: { fontSize: 14, color: '#999', textAlign: 'center', marginBottom: 32 },
  durationLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  durationValue: { fontSize: 36, fontWeight: 'bold', color: '#007AFF', marginBottom: 32 },

  // Error states
  errorIcon: { fontSize: 64, color: '#DC3545', marginBottom: 16 },
  errorTitle: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  errorMessage: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 22 },

  // Buttons
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
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },

  // Camera overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  overlayTop: {
    paddingTop: 60,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 20,
  },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  overlayTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 16,
    alignSelf: 'center',
  },
  overlayBottom: {
    paddingBottom: 60,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingTop: 20,
    alignItems: 'center',
  },
  submittingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  submittingText: { color: '#fff', fontSize: 16 },
  overlayHint: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  manualEntryBtn: { marginTop: 16, paddingVertical: 8 },
  manualEntryText: { color: '#fff', fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
});
