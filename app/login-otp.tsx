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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { requestOtp } from '@/services/auth-service';
import { loadApiMode, setApiMode } from '@/services/api';

type AuthMode = 'otp' | 'code';

export default function LoginOtpScreen() {
  const router = useRouter();
  const { loginWithOtp, loginWithCode } = useAuth();

  const [mode, setMode] = useState<AuthMode>('otp');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isProd, setIsProd] = useState(false);

  useEffect(() => {
    loadApiMode().then((m) => setIsProd(m === 'prod'));
  }, []);

  const toggleMode = async (value: boolean) => {
    setIsProd(value);
    await setApiMode(value ? 'prod' : 'local');
  };

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>CONI</Text>

        {/* Backend URL switch */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: isProd ? '#9ca3af' : '#007AFF' }}>LOCAL</Text>
          <Switch value={isProd} onValueChange={toggleMode} trackColor={{ false: '#d1d5db', true: '#007AFF' }} thumbColor="#fff" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: isProd ? '#007AFF' : '#9ca3af' }}>PROXY PROD</Text>
        </View>
        <Text style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>
          {isProd ? 'ngrok (orice rețea)' : 'local Expo dev'}
        </Text>

        <Text style={styles.subtitle}>Autentificare Angajat</Text>

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
              OTP Telefon
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'code' && styles.modeButtonActive]}
            onPress={() => switchMode('code')}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Autentificare cod login"
          >
            <Text style={[styles.modeButtonText, mode === 'code' && styles.modeButtonTextActive]}>
              Cod Login
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'otp' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Număr de telefon"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
              editable={!loading}
              accessibilityLabel="Număr de telefon"
            />

            {!otpRequested ? (
              <TouchableOpacity
                style={[styles.button, (loading || !phone.trim()) && styles.buttonDisabled]}
                onPress={handleRequestOtp}
                disabled={loading || !phone.trim()}
                accessibilityRole="button"
                accessibilityLabel="Solicită OTP"
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.buttonText}>Se trimite...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Solicită OTP</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Cod OTP"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                  accessibilityLabel="Cod OTP"
                />

                <TouchableOpacity
                  style={[styles.button, (loading || !otpCode.trim()) && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={loading || !otpCode.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Verifică OTP"
                >
                  {loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.buttonText}>Se verifică...</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>Verifică</Text>
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
                  <Text style={styles.resendText}>Retrimite codul</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Cod de login"
              value={loginCode}
              onChangeText={setLoginCode}
              autoCapitalize="none"
              editable={!loading}
              accessibilityLabel="Cod de login"
            />

            <TouchableOpacity
              style={[styles.button, (loading || !loginCode.trim()) && styles.buttonDisabled]}
              onPress={handleLoginWithCode}
              disabled={loading || !loginCode.trim()}
              accessibilityRole="button"
              accessibilityLabel="Autentificare"
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.buttonText}>Se autentifică...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Autentificare</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Link to admin login */}
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push('/login')}
          disabled={loading}
          accessibilityRole="link"
          accessibilityLabel="Login administrator"
        >
          <Text style={styles.linkText}>Login administrator (username/parolă)</Text>
        </TouchableOpacity>
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
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    color: '#888',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
