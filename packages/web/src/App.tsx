import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppBar } from '@/components/layout/AppBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardPage } from '@/pages/DashboardPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { SessionDetailPage } from '@/pages/SessionDetailPage';
import { MachineDetailPage } from '@/pages/MachineDetailPage';
import { CollectionPage } from '@/pages/CollectionPage';
import { useMachines, useSessions, useWebSocket, backfillFirstMessages } from '@/hooks/useApi';

export default function App() {
  const { machines, refresh: refreshMachines } = useMachines();
  const { sessions, refresh: refreshSessions } = useSessions();
  const { connected, on: wsOn } = useWebSocket();

  // Auto-backfill first messages on load
  useEffect(() => {
    backfillFirstMessages().then(() => refreshSessions()).catch(() => {});
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AppBar wsConnected={connected} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          machines={machines}
          sessions={sessions}
          onMachineRenamed={refreshMachines}
          onSessionUpdated={refreshSessions}
        />
        <Routes>
          <Route path="/" element={<DashboardPage machines={machines} sessions={sessions} />} />
          <Route
            path="/sessions"
            element={<SessionsPage machines={machines} onSessionUpdated={refreshSessions} />}
          />
          <Route
            path="/sessions/:sessionId"
            element={<SessionDetailPage machines={machines} sessions={sessions} onSessionUpdated={refreshSessions} wsOn={wsOn} />}
          />
          <Route
            path="/machines/:machineId"
            element={<MachineDetailPage machines={machines} onSessionUpdated={refreshSessions} />}
          />
          <Route
            path="/starred"
            element={<CollectionPage type="starred" machines={machines} sessions={sessions} onSessionUpdated={refreshSessions} />}
          />
          <Route
            path="/watched"
            element={<CollectionPage type="watched" machines={machines} sessions={sessions} onSessionUpdated={refreshSessions} />}
          />
        </Routes>
      </div>
    </div>
  );
}
