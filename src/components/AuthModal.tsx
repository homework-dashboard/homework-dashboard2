import { useState } from 'react';
import { X, Music, LogIn, UserPlus, Loader2, KeyRound, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Props = {
  open: boolean;
  onClose: () => void;
  onAuthed: () => void;
};

export default function AuthModal({ open, onClose, onAuthed }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'recovery'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [regCode, setRegCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);

  if (!open) return null;

  const reset = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setRegCode('');
    setError(null);
    setRecoverySent(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (!email.trim() || (mode !== 'recovery' && !password.trim())) {
      setError('Введите email и пароль.');
      return;
    }
    setLoading(true);

    if (mode === 'recovery') {
      const { error: recErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      setLoading(false);
      if (recErr) {
        setError(recErr.message);
        return;
      }
      setRecoverySent(true);
      return;
    }

    if (mode === 'signup') {
      if (!displayName.trim()) {
        setLoading(false);
        setError('Введите имя для профиля.');
        return;
      }
      if (!regCode.trim()) {
        setLoading(false);
        setError('Введите код регистрации.');
        return;
      }

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpErr) {
        setLoading(false);
        setError(signUpErr.message);
        return;
      }

      const userId = signUpData.user?.id;
      if (!userId) {
        setLoading(false);
        setError('Не удалось создать аккаунт.');
        return;
      }

      const { error: profileErr } = await supabase.from('teacher_profiles').insert({
        teacher_id: userId,
        display_name: displayName.trim(),
      });
      if (profileErr) {
        setLoading(false);
        setError(profileErr.message);
        return;
      }

      const { error: boardErr } = await supabase.from('teachers').insert({
        name: displayName.trim(),
        owner_id: userId,
      });
      if (boardErr) {
        setLoading(false);
        setError(boardErr.message);
        return;
      }

      const { error: consumeErr } = await supabase.rpc('consume_registration_code', {
        p_code: regCode.trim(),
      });
      if (consumeErr) {
        setLoading(false);
        setError(consumeErr.message);
        return;
      }

      setLoading(false);
      onAuthed();
    } else {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (signInErr) {
        setError(signInErr.message);
        return;
      }
      onAuthed();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white">
              <Music size={18} />
            </span>
            <span className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              {mode === 'recovery' ? 'Восстановление пароля' : 'Вход для преподавателей'}
            </span>
          </div>
          <button
            onClick={close}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-stone-200 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5">
          {mode !== 'recovery' && (
            <div className="mb-5 flex rounded-lg bg-stone-100 p-1 dark:bg-slate-700">
              <button
                onClick={() => { setMode('signin'); setError(null); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition-colors ${
                  mode === 'signin' ? 'bg-white text-amber-700 shadow-sm dark:bg-slate-600 dark:text-amber-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <LogIn size={16} /> Вход
              </button>
              <button
                onClick={() => { setMode('signup'); setError(null); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition-colors ${
                  mode === 'signup' ? 'bg-white text-amber-700 shadow-sm dark:bg-slate-600 dark:text-amber-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <UserPlus size={16} /> Регистрация
              </button>
            </div>
          )}

          {recoverySent ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Mail size={32} className="text-amber-600" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Инструкции по восстановлению пароля отправлены на {email}.
              </p>
              <button
                onClick={() => { setMode('signin'); setRecoverySent(false); }}
                className="mt-2 text-sm font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400"
              >
                Вернуться ко входу
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {mode === 'signup' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Имя преподавателя
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Например, Ирина Петровна"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
              </div>

              {mode !== 'recovery' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Пароль
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="Минимум 6 символов"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <KeyRound size={12} /> Код регистрации
                    </span>
                  </label>
                  <input
                    value={regCode}
                    onChange={(e) => setRegCode(e.target.value)}
                    placeholder="Код от администрации школы"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
              )}

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
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : mode === 'recovery' ? (
                  <>
                    <Mail size={18} /> Отправить инструкции
                  </>
                ) : mode === 'signin' ? (
                  <>
                    <LogIn size={18} /> Войти
                  </>
                ) : (
                  <>
                    <UserPlus size={18} /> Зарегистрироваться
                  </>
                )}
              </button>

              {mode === 'signin' && (
                <button
                  onClick={() => { setMode('recovery'); setError(null); }}
                  className="w-full text-center text-sm text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"
                >
                  Забыли пароль?
                </button>
              )}

              {mode === 'recovery' && (
                <button
                  onClick={() => { setMode('signin'); setError(null); }}
                  className="w-full text-center text-sm text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"
                >
                  Вернуться ко входу
                </button>
              )}
            </div>
          )}

          {mode === 'signup' && (
            <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
              Регистрация только по коду от администрации школы.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
