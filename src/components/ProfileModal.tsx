import { useState } from 'react';
import { Check, Loader2, Pencil, UserCircle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import TypeConfirmDialog from '@/components/TypeConfirmDialog';

type Props = {
  profileName: string;
  onClose: () => void;
  onProfileUpdated: (name: string) => void;
  onDeleteAccount: () => Promise<void>;
};

export default function ProfileModal({
  profileName,
  onClose,
  onProfileUpdated,
  onDeleteAccount,
}: Props) {
  const [name, setName] = useState(profileName);
  const [editing, setEditing] = useState(false);
  const [confirmingAccount, setConfirmingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.rpc('update_my_display_name', { p_display_name: trimmed });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setName(trimmed);
    setEditing(false);
    onProfileUpdated(trimmed);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white"><UserCircle size={19} /></span>
              <span className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">Профиль</span>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-stone-200 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-slate-200"><X size={20} /></button>
          </div>

          <div className="space-y-5 px-5 py-5">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Имя профиля</label>
              <div className="flex gap-2">
                <input value={name} onChange={(event) => setName(event.target.value)} disabled={!editing} className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2.5 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-stone-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:disabled:bg-slate-700/50" />
                {editing ? (
                  <button onClick={saveName} disabled={saving || !name.trim()} className="rounded-lg bg-amber-600 px-3 text-white hover:bg-amber-700 disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}</button>
                ) : (
                  <button onClick={() => setEditing(true)} className="rounded-lg bg-stone-100 px-3 text-slate-600 hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"><Pencil size={17} /></button>
                )}
              </div>
              {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <div className="border-t border-stone-200 pt-4 dark:border-slate-700">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Опасные действия</p>
              <button onClick={() => setConfirmingAccount(true)} className="flex w-full items-center gap-2 rounded-lg border border-red-200 px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30">Удалить профиль</button>
            </div>
          </div>
        </div>
      </div>

      {confirmingAccount && (
        <TypeConfirmDialog
          title="Удалить профиль"
          targetName={profileName}
          confirmLabel="Удалить профиль"
          onConfirm={async () => {
            await onDeleteAccount();
          }}
          onCancel={() => setConfirmingAccount(false)}
        />
      )}
    </>
  );
}
