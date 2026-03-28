interface ScoreBarProps {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

function getScoreColor(score: number): string {
  if (score >= 75) return 'from-emerald-500 to-green-400';
  if (score >= 60) return 'from-amber-500 to-yellow-400';
  return 'from-rose-500 to-red-400';
}

export function ScoreBar({ label, value, max = 100, color }: ScoreBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const gradClass = color ?? getScoreColor(value);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-900 font-medium">{Math.round(value)}</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradClass} transition-all duration-1000`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface ScoreCircleProps {
  score: number;
  size?: number;
  label?: string;
}

export function ScoreCircle({ score, size = 120, label }: ScoreCircleProps) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const strokeColor =
    score >= 75 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={8}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-slate-900">{Math.round(score)}</span>
        </div>
      </div>
      {label && <span className="text-slate-500 text-sm">{label}</span>}
    </div>
  );
}
