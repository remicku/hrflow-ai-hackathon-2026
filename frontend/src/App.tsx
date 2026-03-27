import { useState } from 'react';
import LandingPage from './pages/LandingPage';
import BriefingPage from './pages/BriefingPage';
import InterviewPage from './pages/InterviewPage';
import ReportPage from './pages/ReportPage';
import type { AppPage, SessionData, Report } from './types';

export default function App() {
  const [page, setPage] = useState<AppPage>('landing');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const handleRestart = () => {
    setSessionData(null);
    setReport(null);
    setPage('landing');
  };

  return (
    <>
      {page === 'landing' && (
        <LandingPage
          onSessionCreated={(data) => {
            setSessionData(data);
            setPage('briefing');
          }}
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
      {page === 'report' && report && sessionData && (
        <ReportPage
          report={report}
          candidateName={sessionData.candidate_brief.candidate_name}
          onRestart={handleRestart}
        />
      )}
    </>
  );
}
