import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiGet } from '@/services/api';

interface AttendanceSession {
  id: number;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number | null;
  checkInType: string;
  leaderSessionId: number | null;
}

interface AttendanceStatus {
  checkedIn: boolean;
  session: {
    attendanceId: number;
    checkInAt: string;
    checkInType: string;
    numericCode: string | null;
    leaderSessionId: number | null;
  } | null;
}

interface UseAttendanceResult {
  isCheckedIn: boolean;
  currentSession: AttendanceSession | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL_MS = 10_000;

export function useAttendance(): UseAttendanceResult {
  const { token } = useAuth();
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await apiGet<AttendanceStatus>('/api/attendance/status', token);
      if (res.ok) {
        setIsCheckedIn(res.data.checkedIn);
        setCurrentSession(res.data.session ? {
          id: res.data.session.attendanceId,
          checkInAt: res.data.session.checkInAt,
          checkOutAt: null,
          durationMinutes: null,
          checkInType: res.data.session.checkInType,
          leaderSessionId: res.data.session.leaderSessionId,
        } : null);
        setError(null);
      } else {
        const errData = res.data as unknown as { error?: string };
        setError(errData.error ?? 'Failed to fetch attendance status');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();

    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchStatus]);

  return { isCheckedIn, currentSession, loading, error, refetch: fetchStatus };
}
