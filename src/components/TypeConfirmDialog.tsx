import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

type Props = {
  title: string;
  targetName: string;
  label?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
};

export default function TypeConfirmDialog({
  title,
  targetName,
  label = 'Для подтверждения введите точно:',
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = value.trim() === targetName.trim();

  const handleConfirm = async () => {
    if (!matches || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить удаление');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60" onClick={onCancel}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-700/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
              <AlertTriangle size={20} />
            </span>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          </div>
          <button onClick={onCancel} disabled={loading} className="rounded-lg p-1.5 text-slate-400 hover:bg-stone-200 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{label}</p>
          <p className="mb-4 break-words rounded-lg bg-stone-100 px-3 py-2 font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-200">
            {targetName || 'Название не найдено'}
          </p>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && matches && handleConfirm()}
            placeholder="Введите название полностью"
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-lg bg-stone-100 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-stone-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              {cancelLabel}
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !matches}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {loading ? <Loader2 size={17} className="mx-auto animate-spin" /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
