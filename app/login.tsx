import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { loadApiMode, setApiMode, getApiMode } from '@/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isProd, setIsProd] = useState(false);

  useEffect(() => {
    loadApiMode().then((mode) => setIsProd(mode === 'prod'));
  }, []);

  const toggleMode = async (value: boolean) => {
    setIsProd(value);
    await setApiMode(value ? 'prod' : 'local');
  };

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CONI</Text>

      {/* Backend URL switch */}
      <View style={styles.switchRow}>
        <Text style={[styles.switchLabel, !isProd && styles.switchLabelActive]}>LOCAL</Text>
        <Switch
          value={isProd}
          onValueChange={toggleMode}
          trackColor={{ false: '#d1d5db', true: '#007AFF' }}
          thumbColor="#fff"
        />
        <Text style={[styles.switchLabel, isProd && styles.switchLabelActive]}>PROXY PROD</Text>
      </View>
      <Text style={styles.modeHint}>
        {isProd ? 'ngrok (orice rețea)' : 'local Expo dev'}
      </Text>

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Login"
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.buttonText}>Logging in...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 4,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
  switchLabelActive: {
    color: '#007AFF',
  },
  modeHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 20,
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
});
