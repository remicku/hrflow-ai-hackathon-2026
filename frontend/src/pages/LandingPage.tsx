import { useEffect, useState } from 'react';
import { BrainCircuit, Loader2, AlertCircle, Users } from 'lucide-react';
import { fetchHRFlowProfile, fetchHRFlowJob, createSession } from '../api';
import type { SessionData } from '../types';

interface LandingPageProps {
  onSessionCreated: (data: SessionData) => void;
  onOpenHR: () => void;
}

export default function LandingPage({ onSessionCreated, onOpenHR }: LandingPageProps) {
  const params = new URLSearchParams(window.location.search);
  const sourceKey = params.get('source_key') ?? import.meta.env.VITE_HRFLOW_SOURCE_KEY ?? '';
  const profileKey = params.get('profile_key') ?? '';
  const reference = params.get('reference') ?? '';
  const userEmail = params.get('user_email') ?? '';
  const boardKey = params.get('board_key') ?? import.meta.env.VITE_HRFLOW_BOARD_KEY ?? '';
  const jobKey = params.get('job_key') ?? '';

  const [loadingStep, setLoadingStep] = useState('Chargement…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingStep('Récupération du profil…');
        const profile = await fetchHRFlowProfile({
          source_key: sourceKey,
          profile_key: profileKey || undefined,
          reference: reference || undefined,
          user_email: userEmail || undefined,
        });
        let jobOffer: Record<string, unknown> | null = null;
        if (jobKey && boardKey) {
          setLoadingStep("Récupération de l'offre…");
          jobOffer = await fetchHRFlowJob({
            board_key: boardKey,
            job_key: jobKey,
            user_email: userEmail || undefined,
          });
        }
        setLoadingStep("Préparation de l'entretien…");
        const data = await createSession(profile, jobOffer);
        onSessionCreated(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Une erreur est survenue. Vérifiez le lien qui vous a été envoyé.',
        );
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 px-8 py-5 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">Remi AI</span>
          </div>
          <button
            onClick={onOpenHR}
            className="flex items-center gap-2 text-sm text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-400 hover:to-blue-600 px-4 py-2 rounded-xl shadow-md transition-all font-medium"
          >
            <Users className="w-4 h-4" />
            Tableau de bord RH
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center">
        {error ? (
          <div className="flex flex-col items-center gap-4 text-center px-6 animate-fade-in">
            <AlertCircle className="w-12 h-12 text-rose-500" />
            <p className="text-rose-600 max-w-sm">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <p className="text-slate-500">{loadingStep}</p>
          </div>
        )}
      </div>
    </div>
  );
}
