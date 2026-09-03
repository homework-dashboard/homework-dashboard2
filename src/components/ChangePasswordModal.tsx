import { useState } from 'react';
import { X, KeyRound, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Props = {
  forced?: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export default function ChangePasswordModal({ forced, onClose, onChanged }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setError(null);

    if (!forced && !currentPassword.trim()) {
      setError('Введите текущий пароль.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setError('Новый пароль должен содержать минимум 6 символов.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    setLoading(true);

    if (!forced && currentPassword) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: (await supabase.auth.getUser()).data.user?.email || '',
        password: currentPassword,
      });
      if (signInErr) {
        setLoading(false);
        setError('Текущий пароль неверный.');
        return;
      }
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    await supabase.rpc('clear_must_change_password');

    setSuccess(true);
    setTimeout(() => {
      onChanged?.();
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60" onClick={() => { if (!forced) onClose(); }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white">
              <KeyRound size={18} />
            </span>
            <span className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              {forced ? 'Смена пароля' : 'Изменить пароль'}
            </span>
          </div>
          {!forced && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-stone-200 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-slate-200"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          {forced && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              Администратор сбросил ваш пароль. Пожалуйста, задайте новый пароль для продолжения работы.
            </div>
          )}

          {success ? (
            <div className="flex flex-col items-center gap-3 py-8 text-green-600 dark:text-green-400">
              <Check size={32} />
              <p className="text-sm font-medium">Пароль успешно изменён!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {!forced && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Текущий пароль
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Новый пароль
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Повторите новый пароль
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                Сменить пароль
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
