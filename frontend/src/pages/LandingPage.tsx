import { useEffect, useState } from 'react';
import { BrainCircuit, Loader2, AlertCircle, Users } from 'lucide-react';
import { fetchHRFlowProfile, fetchHRFlowJob, createSession } from '../api';
import type { SessionData } from '../types';

interface LandingPageProps {
  onSessionCreated: (data: SessionData) => void;
  onOpenHR: () => void;
}

export default function LandingPage({ onSessionCreated, onOpenHR }: LandingPageProps) {
  const [loadingStep, setLoadingStep] = useState<string>('Chargement…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source_key = params.get('source_key') ?? import.meta.env.VITE_HRFLOW_SOURCE_KEY ?? '';
    const profile_key = params.get('profile_key') ?? '';
    const reference = params.get('reference') ?? '';
    const user_email = params.get('user_email') ?? '';
    const board_key = params.get('board_key') ?? import.meta.env.VITE_HRFLOW_BOARD_KEY ?? '';
    const job_key = params.get('job_key') ?? '';

    if (!source_key || (!profile_key && !reference)) {
      setError('Paramètres manquants dans l\'URL. Vérifiez le lien qui vous a été envoyé.');
      return;
    }

    (async () => {
      try {
        setLoadingStep('Récupération du profil…');
        const profile = await fetchHRFlowProfile({
          source_key,
          profile_key: profile_key || undefined,
          reference: reference || undefined,
          user_email: user_email || undefined,
        });

        let jobOffer: Record<string, unknown> | null = null;
        if (job_key && board_key) {
          setLoadingStep('Récupération de l\'offre…');
          jobOffer = await fetchHRFlowJob({
            board_key,
            job_key,
            user_email: user_email || undefined,
          });
        }

        setLoadingStep('Préparation de l\'entretien…');
        const data = await createSession(profile, jobOffer);
        onSessionCreated(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue. Vérifiez le lien qui vous a été envoyé.');
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 px-8 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">InterviewAI</span>
          </div>
          <button
            onClick={onOpenHR}
            className="flex items-center gap-2 text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 px-4 py-2 rounded-xl shadow-md transition-all font-medium"
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
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
            <p className="text-slate-500">{loadingStep}</p>
          </div>
        )}
      </div>
    </div>
  );
}
