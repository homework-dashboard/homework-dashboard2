import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Plus, Trash2, User, Camera, Loader2, Lock, ImageOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Teacher } from '@/types';
import StateBlock from '@/components/StateBlock';
import TypeConfirmDialog from '@/components/TypeConfirmDialog';

type MyProfile = {
  teacher_id: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
};

type Props = {
  editMode: boolean;
  onOpen: (t: Teacher) => void;
  isAdmin?: boolean;
  myProfile?: MyProfile | null;
  onDeletedSection?: () => void;
};

export default function TeachersView({ editMode, onOpen, isAdmin, myProfile, onDeletedSection }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [myTeacherId, setMyTeacherId] = useState<string | null>(null);
  const [myTeacherIdLoaded, setMyTeacherIdLoaded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) setError(error.message);
    else setTeachers(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (myProfile && !isAdmin) {
      supabase.rpc('get_my_teacher_id').then(({ data }) => {
        setMyTeacherId(data as string | null);
        setMyTeacherIdLoaded(true);
      });
    } else {
      setMyTeacherId(null);
      setMyTeacherIdLoaded(true);
    }
  }, [myProfile, isAdmin]);

  const canEditTeacher = (t: Teacher) => {
    if (!editMode) return false;
    if (isAdmin) return true;
    return t.id === myTeacherId;
  };

  const canAddTeacher = () => {
    if (!editMode) return false;
    return isAdmin;
  };

  const canCreateOwnSection = () => {
    if (!editMode || isAdmin) return false;
    return myTeacherId === null && !!myProfile;
  };

  const createOwnSection = async () => {
    const name = newName.trim();
    if (!name || saving || !canCreateOwnSection() || !myProfile) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('teachers')
      .insert({ name, owner_id: myProfile.teacher_id, sort_order: teachers.length })
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setTeachers((prev) => [...prev, data]);
      setMyTeacherId(data.id);
    }
    setNewName('');
  };

  const addTeacher = async () => {
    const name = newName.trim();
    if (!name || saving || !canAddTeacher()) return;
    setSaving(true);
    const insertData: Record<string, unknown> = { name, sort_order: teachers.length };
    if (!isAdmin && myProfile) {
      insertData.owner_id = myProfile.teacher_id;
    }
    const { data, error } = await supabase
      .from('teachers')
      .insert(insertData)
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) setTeachers((prev) => [...prev, data]);
    setNewName('');
  };

  const rename = async (t: Teacher, name: string) => {
    setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, name } : x)));
    await supabase.from('teachers').update({ name }).eq('id', t.id);
  };

  const remove = async (t: Teacher) => {
    setDeleteTarget(t);
  };

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    const t = deleteTarget;
    setTeachers((prev) => prev.filter((x) => x.id !== t.id));
    const { error } = await supabase.from('teachers').delete().eq('id', t.id);
    if (error) {
      setError(error.message);
      load();
      return;
    }
    if (t.id === myTeacherId) {
      setMyTeacherId(null);
      onDeletedSection?.();
    }
    setDeleteTarget(null);
  };

  const triggerUpload = (teacherId: string) => {
    setUploadFor(teacherId);
    fileRef.current?.click();
  };

  const normalizePhoto = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - side) / 2;
      const sourceY = (image.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Не удалось подготовить фото'));
        return;
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, sourceX, sourceY, side, side, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Не удалось сохранить фото'));
      }, 'image/jpeg', 0.94);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Не удалось открыть выбранное фото'));
    };
    image.src = objectUrl;
  });

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadFor) return;
    setUploadingId(uploadFor);
    try {
      const normalizedPhoto = await normalizePhoto(file);
      const path = `${uploadFor}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('teacher-photos')
        .upload(path, normalizedPhoto, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from('teacher-photos').getPublicUrl(path);
      const photoUrl = pub.publicUrl;
      setTeachers((prev) =>
        prev.map((x) => (x.id === uploadFor ? { ...x, photo_url: photoUrl } : x))
      );
      const { error: updateError } = await supabase
        .from('teachers')
        .update({ photo_url: photoUrl })
        .eq('id', uploadFor);
      if (updateError) {
        setError(updateError.message);
        return;
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить фото');
    } finally {
      setUploadingId(null);
      setUploadFor(null);
      e.target.value = '';
    }
  };

  const removePhoto = async (t: Teacher) => {
    setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, photo_url: null } : x)));
    await supabase.from('teachers').update({ photo_url: null }).eq('id', t.id);
  };

  const Avatar = ({ t, size }: { t: Teacher; size: 'sm' | 'lg' }) => {
    const dim = size === 'lg' ? 'h-[72px] w-[72px]' : 'h-16 w-16';
    if (t.photo_url) {
      return (
        <img
          src={t.photo_url}
          alt={t.name}
          className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-amber-100 dark:ring-amber-900/50`}
          loading="lazy"
        />
      );
    }
    return (
      <span className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400`}>
        <User size={size === 'lg' ? 32 : 26} />
      </span>
    );
  };

  return (
    <section>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-100">Преподаватели</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Выберите преподавателя, чтобы открыть его расписание и задания.
        </p>
      </div>

      {loading || error ? (
        <StateBlock loading={loading} error={error} />
      ) : teachers.length === 0 && !editMode ? (
        <StateBlock empty emptyText="Список преподавателей пока пуст" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <ul className="divide-y divide-stone-100 dark:divide-slate-700">
            {teachers.map((t) => (
              <li key={t.id} className="group">
                {canEditTeacher(t) ? (
                  <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5">
                    <div className="relative shrink-0">
                      <Avatar t={t} size="lg" />
                      {uploadingId === t.id && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70 dark:bg-slate-800/70">
                          <Loader2 size={24} className="animate-spin text-amber-600" />
                        </span>
                      )}
                    </div>
                    <input
                      defaultValue={t.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== t.name) rename(t, v);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                    <button
                      onClick={() => triggerUpload(t.id)}
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-slate-600"
                      title="Загрузить фото"
                    >
                      <Camera size={18} />
                    </button>
                    {t.photo_url && (
                      <button
                        onClick={() => removePhoto(t)}
                        className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        title="Удалить фото"
                      >
                        <ImageOff size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => remove(t)}
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                      title="Удалить преподавателя"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ) : editMode && !isAdmin && t.id !== myTeacherId ? (
                  <button
                    onClick={() => onOpen(t)}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-amber-50/60 sm:px-5 dark:hover:bg-slate-700/50"
                  >
                    <Avatar t={t} size="lg" />
                    <span className="min-w-0 flex-1 truncate text-lg font-medium text-slate-800 sm:text-xl dark:text-slate-200">{t.name}</span>
                    <Lock size={16} className="shrink-0 text-stone-300 dark:text-slate-600" />
                  </button>
                ) : (
                  <button
                    onClick={() => onOpen(t)}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-amber-50/60 sm:px-5 dark:hover:bg-slate-700/50"
                  >
                    <Avatar t={t} size="lg" />
                    <span className="min-w-0 flex-1 truncate text-lg font-medium text-slate-800 sm:text-xl dark:text-slate-200">{t.name}</span>
                    <ChevronRight
                      size={20}
                      className="shrink-0 text-stone-300 transition-transform group-hover:translate-x-1 group-hover:text-amber-600 dark:text-slate-600 dark:group-hover:text-amber-400"
                    />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canAddTeacher() && (
            <div className="flex items-center gap-2 border-t border-stone-100 bg-stone-50 px-4 py-3 sm:px-5 dark:border-slate-700 dark:bg-slate-700/50">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTeacher()}
                placeholder="Имя нового преподавателя"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <button
                onClick={addTeacher}
                disabled={!newName.trim() || saving}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
              >
                <Plus size={16} /> Добавить
              </button>
            </div>
          )}
        </div>
      )}

      {editMode && !isAdmin && myTeacherIdLoaded && myTeacherId === null && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-700 dark:bg-amber-900/30">
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
            У вас пока нет своего раздела преподавателя. Создайте его, чтобы добавлять расписание и задания.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createOwnSection()}
              placeholder="Ваше имя для раздела"
              className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-amber-700 dark:bg-slate-700 dark:text-slate-100"
            />
            <button
              onClick={createOwnSection}
              disabled={!newName.trim() || saving}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
            >
              <Plus size={16} /> Создать раздел
            </button>
          </div>
        </div>
      )}
      {deleteTarget && (
        <TypeConfirmDialog
          title="Удалить раздел преподавателя"
          targetName={deleteTarget.name}
          confirmLabel="Удалить раздел"
          onConfirm={confirmRemove}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
