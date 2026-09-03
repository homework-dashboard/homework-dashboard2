import { Loader2, AlertCircle, Inbox } from 'lucide-react';

type Props = {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
};

export default function StateBlock({ loading, error, empty, emptyText }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white py-16 text-slate-400 dark:border-slate-700 dark:bg-slate-800">
        <Loader2 className="animate-spin text-amber-600" size={28} />
        <p className="text-sm font-medium">Загрузка…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-red-200 bg-red-50 py-14 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertCircle size={28} />
        <p className="text-sm font-medium">Не удалось загрузить данные</p>
        <p className="max-w-md text-center text-xs text-red-500 dark:text-red-500">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-slate-400 dark:border-slate-600 dark:bg-slate-800">
        <Inbox size={28} />
        <p className="text-sm font-medium">{emptyText ?? 'Пока пусто'}</p>
      </div>
    );
  }
  return null;
}
