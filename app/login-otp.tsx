import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { requestOtp } from '@/services/auth-service';
import { useTranslation } from '@/i18n';
import { registerPushToken } from '@/services/push-token';

type AuthMode = 'otp' | 'code';

export default function LoginOtpScreen() {
  const router = useRouter();
  const { loginWithOtp, loginWithCode, token: authToken } = useAuth();
  const { t } = useTranslation();

  const [mode, setMode] = useState<AuthMode>('otp');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const justLoggedIn = React.useRef(false);

  // Register push token after successful login
  useEffect(() => {
    if (authToken && justLoggedIn.current) {
      justLoggedIn.current = false;
      registerPushToken(authToken).catch(() => {});
    }
  }, [authToken]);

  const handleRequestOtp = async () => {
    setError('');
    setLoading(true);
    try {
      await requestOtp(phone);
      setOtpRequested(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send OTP';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setLoading(true);
    try {
      justLoggedIn.current = true;
      await loginWithOtp(phone, otpCode);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'OTP verification failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginWithCode = async () => {
    setError('');
    setLoading(true);
    try {
      justLoggedIn.current = true;
      await loginWithCode(loginCode);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login code authentication failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setOtpRequested(false);
    setOtpCode('');
    setLoginCode('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require('@/assets/images/cropped-fg-logo-1-1.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{t('login.title')}</Text>

        <Text style={styles.subtitle}>{t('loginOtp.subtitle')}</Text>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'otp' && styles.modeButtonActive]}
            onPress={() => switchMode('otp')}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Autentificare OTP"
          >
            <Text style={[styles.modeButtonText, mode === 'otp' && styles.modeButtonTextActive]}>
              {t('loginOtp.otpPhone')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'code' && styles.modeButtonActive]}
            onPress={() => switchMode('code')}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t('loginOtp.loginCode')}
          >
            <Text style={[styles.modeButtonText, mode === 'code' && styles.modeButtonTextActive]}>
              {t('loginOtp.loginCode')}
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'otp' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder={t('loginOtp.phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
              editable={!loading}
              accessibilityLabel={t('loginOtp.phone')}
            />

            {!otpRequested ? (
              <TouchableOpacity
                style={[styles.button, (loading || !phone.trim()) && styles.buttonDisabled]}
                onPress={handleRequestOtp}
                disabled={loading || !phone.trim()}
                accessibilityRole="button"
                accessibilityLabel={t('loginOtp.requestOtp')}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.buttonText}>{t('loginOtp.sending')}</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>{t('loginOtp.requestOtp')}</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={t('loginOtp.otpCode')}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                  accessibilityLabel={t('loginOtp.otpCode')}
                />

                <TouchableOpacity
                  style={[styles.button, (loading || !otpCode.trim()) && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={loading || !otpCode.trim()}
                  accessibilityRole="button"
                  accessibilityLabel={t('loginOtp.verify')}
                >
                  {loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.buttonText}>{t('loginOtp.verifying')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>{t('loginOtp.verify')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={() => {
                    setOtpRequested(false);
                    setOtpCode('');
                    setError('');
                  }}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Retrimite OTP"
                >
                  <Text style={styles.resendText}>{t('loginOtp.resendCode')}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={t('loginOtp.loginCodePlaceholder')}
              value={loginCode}
              onChangeText={setLoginCode}
              autoCapitalize="none"
              editable={!loading}
              accessibilityLabel={t('loginOtp.loginCodePlaceholder')}
            />

            <TouchableOpacity
              style={[styles.button, (loading || !loginCode.trim()) && styles.buttonDisabled]}
              onPress={handleLoginWithCode}
              disabled={loading || !loginCode.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('loginOtp.authenticate')}
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.buttonText}>{t('loginOtp.authenticating')}</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>{t('loginOtp.authenticate')}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  modeToggle: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    overflow: 'hidden',
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  error: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 14,
    fontSize: 14,
  },
  resendButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  resendText: {
    color: '#007AFF',
    fontSize: 14,
  },
});
