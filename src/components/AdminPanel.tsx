import { useEffect, useState } from 'react';
import { KeyRound, Plus, Copy, Check, Trash2, Loader2, ShieldCheck, User, ShieldAlert, Key, Link2, UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import TypeConfirmDialog from '@/components/TypeConfirmDialog';

type RegCode = {
  id: string;
  code: string;
  used: boolean;
  created_at: string;
};

type AdminTeacher = {
  id: string;
  name: string;
  photo_url: string | null;
  owner_id: string | null;
};

type TeacherAccount = {
  teacher_id: string;
  display_name: string;
  is_admin: boolean;
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(4)}-${part(6)}`;
}

type Props = {
  onClose: () => void;
};

export default function AdminPanel({ onClose }: Props) {
  const [codes, setCodes] = useState<RegCode[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [accounts, setAccounts] = useState<TeacherAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ teacherId: string; password: string } | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<null | {
    title: string;
    targetName: string;
    confirmLabel: string;
    onConfirm: () => Promise<void> | void;
  }>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [
      { data: codeData, error: codeErr },
      { data: tData, error: tErr },
      { data: accData, error: accErr },
    ] = await Promise.all([
      supabase.from('registration_codes').select('id, code, used, created_at').order('created_at', { ascending: false }),
      supabase.rpc('list_teachers_admin'),
      supabase.rpc('list_teacher_accounts'),
    ]);
    if (codeErr || tErr || accErr) {
      setError(codeErr?.message || tErr?.message || accErr?.message || 'Ошибка загрузки');
    } else {
      setCodes((codeData as RegCode[]) ?? []);
      setTeachers((tData as AdminTeacher[]) ?? []);
      setAccounts((accData as TeacherAccount[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const createCode = async () => {
    setCreating(true);
    setError(null);
    const code = generateCode();
    const { error } = await supabase.from('registration_codes').insert({ code });
    setCreating(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCopied(null);
    await load();
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard not available
    }
  };

  const deleteCode = async (c: RegCode) => {
    setConfirmDialog({
      title: 'Удалить код регистрации',
      targetName: c.code,
      confirmLabel: 'Удалить код',
      onConfirm: async () => {
        setConfirmDialog(null);
        const { error } = await supabase.rpc('admin_delete_registration_code', { p_code_id: c.id });
        if (error) {
          setError(error.message);
          return;
        }
        setCodes((prev) => prev.filter((x) => x.id !== c.id));
      },
    });
  };

  const deleteTeacher = async (id: string, name: string) => {
    setConfirmDialog({
      title: 'Удалить раздел преподавателя',
      targetName: name,
      confirmLabel: 'Удалить раздел',
      onConfirm: async () => {
        setConfirmDialog(null);
        const { error } = await supabase.rpc('delete_teacher_admin', { p_teacher_id: id });
        if (error) {
          setError(error.message);
          return;
        }
        setTeachers((prev) => prev.filter((t) => t.id !== id));
      },
    });
  };

  const deleteAccount = async (accountId: string, name: string) => {
    setConfirmDialog({
      title: 'Удалить аккаунт преподавателя',
      targetName: name,
      confirmLabel: 'Удалить аккаунт',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const session = (await supabase.auth.getSession()).data.session;
          if (!session) return;
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user-account`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({ userId: accountId }),
            }
          );
          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Ошибка ${response.status}`);
          }
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Не удалось удалить аккаунт');
        }
      },
    });
  };

  const toggleAdmin = async (teacherId: string, makeAdmin: boolean) => {
    setTogglingId(teacherId);
    setError(null);
    const { error } = await supabase.rpc('set_admin_status', {
      p_teacher_id: teacherId,
      p_is_admin: makeAdmin,
    });
    setTogglingId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setAccounts((prev) =>
      prev.map((a) => (a.teacher_id === teacherId ? { ...a, is_admin: makeAdmin } : a)),
    );
  };

  const resetPassword = async (teacherId: string, name: string) => {
    if (!confirm(`Сбросить пароль для «${name}»? Будет создан временный пароль.`)) return;
    setResettingId(teacherId);
    setError(null);
    setTempPassword(null);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ userId: teacherId }),
        }
      );
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Ошибка ${response.status}`);
      }
      const data = await response.json();
      setTempPassword({ teacherId, password: data.tempPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить пароль');
    }
    setResettingId(null);
  };

  const copyTempPassword = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword.password);
      setCopied(`temp-${tempPassword.teacherId}`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard not available
    }
  };

  const startAssign = (teacherId: string, _currentName: string) => {
    setAssigningId(teacherId);
  };

  const confirmAssign = async (teacherId: string, ownerId: string) => {
    setAssigningId(null);
    const { error } = await supabase.rpc('assign_teacher_owner', {
      p_teacher_id: teacherId,
      p_owner_id: ownerId,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setTeachers((prev) => prev.map((t) => (t.id === teacherId ? { ...t, owner_id: ownerId } : t)));
  };

  const unassignOwner = async (teacherId: string) => {
    const { error } = await supabase.rpc('assign_teacher_owner', {
      p_teacher_id: teacherId,
      p_owner_id: null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setTeachers((prev) => prev.map((t) => (t.id === teacherId ? { ...t, owner_id: null } : t)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-white dark:bg-slate-600">
              <ShieldCheck size={18} />
            </span>
            <span className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Панель администратора
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-stone-200 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-slate-200"
          >
            Закрыть
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Temporary password display */}
          {tempPassword && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-900/30">
              <p className="mb-1 text-sm font-semibold text-amber-900 dark:text-amber-300">
                Временный пароль для преподавателя:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-white px-3 py-2 font-mono text-lg font-bold text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                  {tempPassword.password}
                </code>
                <button
                  onClick={copyTempPassword}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  {copied === `temp-${tempPassword.teacherId}` ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Передайте этот пароль преподавателю. При первом входе он должен будет сменить его на свой собственный.
              </p>
            </div>
          )}

          {/* Registration codes section */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <KeyRound size={16} /> Коды регистрации
              </h2>
              <button
                onClick={createCode}
                disabled={creating}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Создать код
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 dark:text-slate-500">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : codes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 py-8 text-center text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
                Кодов пока нет. Создайте код, чтобы преподаватель мог зарегистрироваться.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-slate-700">
                <ul className="divide-y divide-stone-100 dark:divide-slate-700">
                  {codes.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-3 py-2.5 sm:gap-3">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-stone-100 px-2.5 py-1.5 font-mono text-sm font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                        {c.code}
                      </code>
                      <span
                        className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${
                          c.used
                            ? 'bg-stone-200 text-stone-500 dark:bg-slate-600 dark:text-slate-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}
                      >
                        {c.used ? 'Использован' : 'Активен'}
                      </span>
                      <button
                        onClick={() => copyCode(c.code)}
                        disabled={c.used}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-30 dark:hover:bg-slate-600"
                        title="Копировать"
                      >
                        {copied === c.code ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                      </button>
                      <button
                        onClick={() => deleteCode(c)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        title="Удалить код"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Передайте активный код преподавателю. Код одноразовый — после регистрации он погаснет.
            </p>
          </div>

          {/* Teacher accounts (admin management) section */}
          <div className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <ShieldAlert size={16} /> Аккаунты преподавателей
            </h2>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 dark:text-slate-500">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 py-8 text-center text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
                Зарегистрированных преподавателей пока нет.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-slate-700">
                <ul className="divide-y divide-stone-100 dark:divide-slate-700">
                  {accounts.map((a) => (
                    <li key={a.teacher_id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap sm:gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          a.is_admin ? 'bg-slate-800 text-white dark:bg-slate-600' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                        }`}
                      >
                        {a.is_admin ? <ShieldCheck size={16} /> : <User size={16} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">{a.display_name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          a.is_admin ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-300' : 'bg-stone-100 text-stone-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}
                      >
                        {a.is_admin ? 'Админ' : 'Препод.'}
                      </span>
                      <button
                        onClick={() => toggleAdmin(a.teacher_id, !a.is_admin)}
                        disabled={togglingId === a.teacher_id}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          a.is_admin
                            ? 'bg-stone-100 text-slate-600 hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                            : 'bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500'
                        }`}
                      >
                        {togglingId === a.teacher_id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : a.is_admin ? (
                          'Снять'
                        ) : (
                          'Админ'
                        )}
                      </button>
                      {!a.is_admin && (
                        <>
                          <button
                            onClick={() => resetPassword(a.teacher_id, a.display_name)}
                            disabled={resettingId === a.teacher_id}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50 dark:hover:bg-slate-600"
                            title="Сбросить пароль"
                          >
                            {resettingId === a.teacher_id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Key size={15} />
                            )}
                          </button>
                          <button
                            onClick={() => deleteAccount(a.teacher_id, a.display_name)}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                            title="Удалить аккаунт"
                          >
                            <UserX size={16} />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Администратор может управлять правами, сбрасывать пароли, удалять аккаунты и создавать коды регистрации.
            </p>
          </div>

          {/* Teachers sections */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <User size={16} /> Разделы преподавателей
            </h2>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 dark:text-slate-500">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : teachers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 py-8 text-center text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
                Преподавателей пока нет.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-slate-700">
                <ul className="divide-y divide-stone-100 dark:divide-slate-700">
                  {teachers.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap sm:gap-3">
                      {t.photo_url ? (
                        <img
                          src={t.photo_url}
                          alt={t.name}
                          className="h-12 w-12 shrink-0 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                          <User size={20} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">{t.name}</span>
                        {t.owner_id ? (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <Link2 size={11} />
                            {accounts.find((a) => a.teacher_id === t.owner_id)?.display_name || 'Привязан'}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">Не привязан к аккаунту</span>
                        )}
                      </div>
                      {assigningId === t.id ? (
                        <select
                          autoFocus
                          value=""
                          onChange={(e) => {
                            if (e.target.value) confirmAssign(t.id, e.target.value);
                            else setAssigningId(null);
                          }}
                          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-amber-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                        >
                          <option value="">Выбрать аккаунт…</option>
                          {accounts.filter((a) => !a.is_admin).map((a) => (
                            <option key={a.teacher_id} value={a.teacher_id}>{a.display_name}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => startAssign(t.id, t.name)}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-600"
                          title="Привязать к аккаунту"
                        >
                          <Link2 size={15} />
                        </button>
                      )}
                      {t.owner_id && (
                        <button
                          onClick={() => unassignOwner(t.id)}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-stone-200 hover:text-slate-600 dark:hover:bg-slate-600"
                          title="Отвязать аккаунт"
                        >
                          <User size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteTeacher(t.id, t.name)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        title="Удалить раздел"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmDialog && (
        <TypeConfirmDialog
          title={confirmDialog.title}
          targetName={confirmDialog.targetName}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
