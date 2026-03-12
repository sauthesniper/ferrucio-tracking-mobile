import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useTranslation } from '@/i18n';
import { registerPushToken } from '@/services/push-token';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * AnimatedBackground — continuous red (#CC0000) → black (#000000) animated background.
 * Uses multiple overlapping layers with animated translateY and opacity to simulate
 * a moving gradient effect. Runs entirely on the native UI thread via reanimated
 * worklets for smooth 60 FPS performance.
 */
function AnimatedBackground() {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    // Slow continuous vertical movement — runs on native thread
    translateY.value = withRepeat(
      withTiming(-200, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      true // reverse
    );
    // Subtle opacity pulse for the red layer
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [translateY, opacity]);

  const animatedRedTop = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const animatedRedBottom = useAnimatedStyle(() => ({
    transform: [{ translateY: -translateY.value }],
    opacity: opacity.value * 0.6,
  }));

  return (
    <View style={bgStyles.container}>
      {/* Base black layer */}
      <View style={bgStyles.blackBase} />
      {/* Animated red layer — top region */}
      <Animated.View style={[bgStyles.redLayerTop, animatedRedTop]} />
      {/* Animated red layer — bottom region */}
      <Animated.View style={[bgStyles.redLayerBottom, animatedRedBottom]} />
    </View>
  );
}

const bgStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blackBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  redLayerTop: {
    position: 'absolute',
    top: -100,
    left: -50,
    right: -50,
    height: '60%',
    borderRadius: 200,
    backgroundColor: '#CC0000',
  },
  redLayerBottom: {
    position: 'absolute',
    bottom: -100,
    left: -50,
    right: -50,
    height: '40%',
    borderRadius: 200,
    backgroundColor: '#CC0000',
  },
});


export default function LoginScreen() {
  const router = useRouter();
  const { loginWithCode, token: authToken } = useAuth();
  const { t } = useTranslation();

  const [loginCode, setLoginCode] = useState('');
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

  const handleLogin = async () => {
    setError('');
    if (!loginCode.trim()) return;
    setLoading(true);
    try {
      justLoggedIn.current = true;
      await loginWithCode(loginCode.trim());
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AnimatedBackground />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Image
            source={require('@/assets/images/cropped-fg-logo-1-1.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Feruccio logo"
          />
          <Text style={styles.brandTitle}>Feruccio</Text>

          <Text style={styles.title}>{t('login.title')}</Text>

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          <TextInput
            style={styles.input}
            placeholder={t('login.loginCodePlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={loginCode}
            onChangeText={setLoginCode}
            autoCapitalize="none"
            editable={!loading}
            accessibilityLabel={t('login.loginCodePlaceholder')}
          />

          <TouchableOpacity
            style={[styles.button, (loading || !loginCode.trim()) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || !loginCode.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('login.submit')}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.buttonText}>{t('login.loggingIn')}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{t('login.submit')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/login-otp')}
            disabled={loading}
            accessibilityRole="link"
            accessibilityLabel={t('login.otpLink')}
          >
            <Text style={styles.linkText}>{t('login.otpLink')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              router.push('/qr-login' as never);
            }}
            disabled={loading}
            accessibilityRole="link"
            accessibilityLabel={t('login.qrLink')}
          >
            <Text style={styles.linkText}>{t('login.qrLink')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    color: '#FF4444',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#FFFFFF',
  },
  button: {
    backgroundColor: '#CC0000',
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
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 14,
    fontSize: 14,
  },
  linkButton: {
    marginTop: 18,
    alignItems: 'center',
  },
  linkText: {
    color: '#FF8888',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
