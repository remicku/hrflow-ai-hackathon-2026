interface CompletionPageProps {
  candidateName: string;
}

export default function CompletionPage({ candidateName }: CompletionPageProps) {
  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Merci {candidateName} !
          </h1>
          <p className="text-slate-500 text-base leading-relaxed">
            Votre entretien est terminé. Nous avons bien enregistré vos réponses et nous vous contacterons prochainement.
          </p>
        </div>
      </div>
    </div>
  );
}
