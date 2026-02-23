import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocationTracking } from '@/hooks/use-location-tracking';

export default function TrackingScreen() {
  const { latitude, longitude, speed, permissionDenied, error, refreshing, refresh } = useLocationTracking();

  const speedKmh = speed != null && speed >= 0 ? (speed * 3.6).toFixed(1) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tracking</Text>
        <TouchableOpacity
          style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
          onPress={refresh}
          disabled={refreshing}
          accessibilityLabel="Refresh location"
          accessibilityRole="button"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.refreshIcon}>↻</Text>
          )}
        </TouchableOpacity>
      </View>

      {permissionDenied && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Location permission is required for tracking. Please enable it in your device settings.
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!permissionDenied && !error && latitude === null && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Waiting for GPS...</Text>
        </View>
      )}

      {latitude !== null && longitude !== null && (
        <View style={styles.coordsContainer}>
          <Text style={styles.label}>Latitude</Text>
          <Text style={styles.value}>{latitude.toFixed(6)}</Text>
          <Text style={styles.label}>Longitude</Text>
          <Text style={styles.value}>{longitude.toFixed(6)}</Text>
          {speedKmh && (
            <>
              <Text style={styles.label}>Speed</Text>
              <Text style={styles.value}>{speedKmh} km/h</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  refreshBtn: { backgroundColor: '#007AFF', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  refreshBtnDisabled: { opacity: 0.6 },
  refreshIcon: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  warningBox: { backgroundColor: '#FFF3CD', borderRadius: 8, padding: 16, marginBottom: 16 },
  warningText: { color: '#856404', fontSize: 15 },
  errorBox: { backgroundColor: '#F8D7DA', borderRadius: 8, padding: 16, marginBottom: 16 },
  errorText: { color: '#721C24', fontSize: 15 },
  loadingContainer: { alignItems: 'center', marginTop: 40, gap: 12 },
  loadingText: { fontSize: 16, color: '#666' },
  coordsContainer: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 20 },
  label: { fontSize: 14, color: '#666', marginTop: 8 },
  value: { fontSize: 22, fontWeight: '600', color: '#333' },
});
