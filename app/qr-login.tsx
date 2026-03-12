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
import { useTranslation } from '@/i18n';
import { registerPushToken } from '@/services/push-token';
import { extractLoginCode } from '@/utils/qr-login-utils';

export default function QRLoginScreen() {
  const router = useRouter();
  const { loginWithCode, token: authToken } = useAuth();
  const { t } = useTranslation();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processingRef = useRef(false);
  const justLoggedIn = useRef(false);

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Register push token after successful login
  useEffect(() => {
    if (authToken && justLoggedIn.current) {
      justLoggedIn.current = false;
      registerPushToken(authToken).catch(() => {});
    }
  }, [authToken]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (processingRef.current || !scanning) return;
    processingRef.current = true;
    setScanning(false);
    setSubmitting(true);
    setError(null);

    const code = extractLoginCode(data);
    if (!code) {
      setError(t('qrLogin.invalidQr'));
      setSubmitting(false);
      processingRef.current = false;
      return;
    }

    try {
      justLoggedIn.current = true;
      await loginWithCode(code);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('qrLogin.loginFailed');
      setError(message);
    } finally {
      setSubmitting(false);
      processingRef.current = false;
    }
  };

  const handleRetry = () => {
    setError(null);
    setScanning(true);
  };

  const handleBack = () => {
    router.back();
  };

  // --- Permission loading ---
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // --- Permission denied ---
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.permissionTitle}>{t('qrLogin.permissionTitle')}</Text>
          <Text style={styles.permissionText}>{t('qrLogin.permissionText')}</Text>
          {permission.canAskAgain ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={requestPermission}
              accessibilityLabel={t('qrLogin.grantPermission')}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{t('qrLogin.grantPermission')}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.permissionText}>{t('qrLogin.enableInSettings')}</Text>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleBack}
            accessibilityLabel={t('qrLogin.back')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>{t('qrLogin.back')}</Text>
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
          <Text style={styles.errorTitle}>{t('qrLogin.error')}</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleRetry}
            accessibilityLabel={t('qrLogin.scanAgain')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>{t('qrLogin.scanAgain')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleBack}
            accessibilityLabel={t('qrLogin.back')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>{t('qrLogin.back')}</Text>
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

      <View style={styles.overlay}>
        <View style={styles.overlayTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityLabel={t('qrLogin.back')}
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>← {t('qrLogin.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.overlayTitle}>{t('qrLogin.title')}</Text>
        </View>

        <View style={styles.scanFrame} />

        <View style={styles.overlayBottom}>
          {submitting && (
            <View style={styles.submittingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submittingText}>{t('qrLogin.processing')}</Text>
            </View>
          )}
          <Text style={styles.overlayHint}>{t('qrLogin.pointCamera')}</Text>
        </View>
      </View>
    </View>
  );
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
  permissionTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  permissionText: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },

  errorIcon: { fontSize: 64, color: '#DC3545', marginBottom: 16 },
  errorTitle: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  errorMessage: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 22 },

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
});
