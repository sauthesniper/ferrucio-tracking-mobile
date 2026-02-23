import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import Svg, { Path } from 'react-native-svg';

export default function ContactScreen() {
  const router = useRouter();
  const { name, phone } = useLocalSearchParams<{ name: string; phone: string }>();

  const handleCall = () => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleSMS = () => {
    Linking.openURL(`sms:${phone}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Contact</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.nameText}>{name ?? 'Unknown'}</Text>
        <Text style={styles.phoneText}>{phone ?? '—'}</Text>
      </View>

      <TouchableOpacity
        style={styles.callBtn}
        onPress={handleCall}
        disabled={!phone}
        accessibilityLabel={`Call ${name}`}
        accessibilityRole="button"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" fill="#fff" /></Svg>
          <Text style={styles.btnText}>Call</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.smsBtn}
        onPress={handleSMS}
        disabled={!phone}
        accessibilityLabel={`Send SMS to ${name}`}
        accessibilityRole="button"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" fill="#007AFF" /></Svg>
          <Text style={styles.smsBtnText}>SMS</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, paddingTop: 60 },
  header: { marginBottom: 32 },
  backText: { color: '#007AFF', fontSize: 17, fontWeight: '600', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  card: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  nameText: { fontSize: 22, fontWeight: '600', color: '#333', marginBottom: 8 },
  phoneText: { fontSize: 18, color: '#007AFF', fontVariant: ['tabular-nums'] },
  callBtn: {
    backgroundColor: '#28A745',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  smsBtn: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  smsBtnText: { color: '#007AFF', fontSize: 18, fontWeight: '600' },
});
