import { useState } from 'react';
import LandingPage from './pages/LandingPage';
import BriefingPage from './pages/BriefingPage';
import InterviewPage from './pages/InterviewPage';
import CompletionPage from './pages/CompletionPage';
import HRDashboard from './pages/HRDashboard';
import type { AppPage, SessionData, Report } from './types';

function hasInterviewParams() {
  const params = new URLSearchParams(window.location.search);
  const sourceKey = params.get('source_key');
  const profileKey = params.get('profile_key');
  const reference = params.get('reference');
  return Boolean(sourceKey && (profileKey || reference));
}

export default function App() {
  const [page, setPage] = useState<AppPage>(hasInterviewParams() ? 'landing' : 'hr_dashboard');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const handleRestart = () => {
    setSessionData(null);
    setReport(null);
    setPage('hr_dashboard');
  };

  return (
    <>
      {page === 'landing' && (
        <LandingPage
          onSessionCreated={(data) => {
            setSessionData(data);
            setPage('briefing');
          }}
          onOpenHR={() => setPage('hr_dashboard')}
        />
      )}
      {page === 'briefing' && sessionData && (
        <BriefingPage
          sessionData={sessionData}
          onStart={() => setPage('interview')}
        />
      )}
      {page === 'interview' && sessionData && (
        <InterviewPage
          sessionData={sessionData}
          onComplete={(r) => {
            setReport(r);
            setPage('report');
          }}
        />
      )}
      {page === 'report' && sessionData && (
        <CompletionPage candidateName={sessionData.candidate_brief.candidate_name} />
      )}
      {page === 'hr_dashboard' && (
        <HRDashboard onBack={() => setPage('landing')} />
      )}
    </>
  );
}
