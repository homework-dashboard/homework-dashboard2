import { useEffect, useState } from 'react';
import { Plus, Trash2, CalendarDays, Lock, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Lesson, Homework, HomeworkSubject, HomeworkEntry } from '@/types';
import { weekdayName, formatTime } from '@/types';
import StateBlock from '@/components/StateBlock';

type MyProfile = {
  teacher_id: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
};

type Props = {
  lessonSlug: string;
  teacherSlug: string;
  editMode: boolean;
  isAdmin?: boolean;
  myProfile?: MyProfile | null;
 };

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function HomeworkView({ lessonSlug, teacherSlug, editMode, isAdmin, myProfile }: Props) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [rows, setRows] = useState<Homework[]>([]);
  const [subjects, setSubjects] = useState<HomeworkSubject[]>([]);
  const [entries, setEntries] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);

    (async () => {
      const lessonRes = await supabase
        .from('lessons')
        .select('*')
        .eq('slug', lessonSlug)
        .maybeSingle();

      if (lessonRes.error) {
        setError(lessonRes.error.message);
        setLoading(false);
        return;
      }

      if (!lessonRes.data) {
        setError('Занятие не найдено');
        setLoading(false);
        return;
      }

      const lessonData = lessonRes.data as Lesson;
      setLesson(lessonData);
      setTeacherId(lessonData.teacher_id);

      const [hwRes, subjRes, entRes] = await Promise.all([
        supabase
          .from('homework')
          .select('*')
          .eq('lesson_id', lessonData.id)
          .order('due_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('homework_subjects')
          .select('*')
          .eq('lesson_id', lessonData.id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('homework_entries')
          .select('homework_id, subject_id, content'),
      ]);

      if (hwRes.error) setError(hwRes.error.message);
      else if (subjRes.error) setError(subjRes.error.message);
      else if (entRes.error) setError(entRes.error.message);
      else {
        setRows(hwRes.data ?? []);
        setSubjects(subjRes.data ?? []);
        const entMap: Record<string, Record<string, string>> = {};
        for (const e of entRes.data ?? []) {
          if (!entMap[e.homework_id]) entMap[e.homework_id] = {};
          entMap[e.homework_id][e.subject_id] = e.content;
        }
        setEntries(entMap);
      }

      setLoading(false);

      if (myProfile && !isAdmin) {
        supabase.rpc('get_my_teacher_id').then(({ data }) => {
          setCanEdit(data === lessonData.teacher_id);
        });
      } else {
        setCanEdit(!!isAdmin);
      }
    })();
  }, [lessonSlug, teacherSlug, myProfile, isAdmin]);

  const editable = editMode && canEdit;

  const ensureDefaultSubject = async (): Promise<string | null> => {
    if (subjects.length > 0) return subjects[0].id;
    const { data, error } = await supabase
      .from('homework_subjects')
      .insert({ lesson_id: lesson?.id, name: lesson?.subject || 'Предмет', sort_order: 0 })
      .select()
      .maybeSingle();
    if (error) {
      setError(error.message);
      return null;
    }
    if (data) {
      setSubjects((prev) => [...prev, data]);
      return data.id;
    }
    return null;
  };

  const addRow = async () => {
    if (saving || !editable || !lesson) return;
    setSaving(true);
    const subjId = await ensureDefaultSubject();
    if (!subjId) {
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from('homework')
      .insert({ lesson_id: lesson.id, due_date: today(), solfeggio: '', music_literature: '' })
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setRows((prev) => [data, ...prev]);
      setEntries((prev) => ({ ...prev, [data.id]: {} }));
    }
  };

  const patchDate = async (r: Homework, due_date: string) => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, due_date } : x)));
    await supabase.from('homework').update({ due_date }).eq('id', r.id);
  };

  const patchEntry = async (hwId: string, subjId: string, content: string) => {
    setEntries((prev) => ({
      ...prev,
      [hwId]: { ...(prev[hwId] ?? {}), [subjId]: content },
    }));
    const { data: existing } = await supabase
      .from('homework_entries')
      .select('id')
      .eq('homework_id', hwId)
      .eq('subject_id', subjId)
      .maybeSingle();
    if (existing) {
      await supabase.from('homework_entries').update({ content }).eq('id', existing.id);
    } else {
      await supabase.from('homework_entries').insert({ homework_id: hwId, subject_id: subjId, content });
    }
  };

  const removeRow = async (r: Homework) => {
    if (!confirm('Удалить эту строку задания?')) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    const { error } = await supabase.from('homework').delete().eq('id', r.id);
    if (error) {
      setError(error.message);
    }
  };

  const renameSubject = async (s: HomeworkSubject, name: string) => {
    setSubjects((prev) => prev.map((x) => (x.id === s.id ? { ...x, name } : x)));
    await supabase.from('homework_subjects').update({ name }).eq('id', s.id);
  };

  const addSubject = async () => {
    const name = newSubjectName.trim();
    if (!name || saving || !editable || !lesson) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('homework_subjects')
      .insert({ lesson_id: lesson.id, name, sort_order: subjects.length })
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) setSubjects((prev) => [...prev, data]);
    setNewSubjectName('');
  };

  const removeSubject = async (s: HomeworkSubject) => {
    if (!confirm(`Удалить предмет «${s.name || 'без названия'}» и все задания в нём?`)) return;
    setSubjects((prev) => prev.filter((x) => x.id !== s.id));
    const { error } = await supabase.from('homework_subjects').delete().eq('id', s.id);
    if (error) {
      setError(error.message);
    }
  };

  const title = lesson
    ? [
        weekdayName(lesson.weekday),
        formatTime(lesson.start_time),
        lesson.class_name,
        lesson.classroom,
      ].filter(Boolean).join(' · ') || 'Класс'
    : '…';

  const colCount = subjects.length;
  const dateColW = 'minmax(90px, 110px)';
  const subjColW = 'minmax(140px, 1fr)';
  const actionColW = '40px';

  const gridTemplateColumns = editable
    ? `${dateColW} repeat(${colCount}, ${subjColW}) ${actionColW}`
    : `${dateColW} repeat(${colCount}, ${subjColW})`;

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns,
  };

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Домашние задания по датам.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editMode && !canEdit && (
            <span className="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              <Lock size={12} /> Только просмотр
            </span>
          )}
          {editable && (
            <button
              onClick={addRow}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
            >
              <Plus size={16} /> Добавить дату
            </button>
          )}
        </div>
      </div>

      {loading || error ? (
        <StateBlock loading={loading} error={error} />
      ) : rows.length === 0 && !editable ? (
        <StateBlock empty emptyText="Задания пока не добавлены" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {/* Header row */}
          <div
            className="flex items-stretch border-b-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
            style={gridStyle}
          >
            <div className="flex items-center gap-1.5 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-amber-800 sm:px-4 dark:text-amber-400">
              <CalendarDays size={14} /> <span className="hidden sm:inline">Дата</span>
            </div>
            {subjects.map((s) => (
              <div key={s.id} className="border-l border-amber-200 px-2 py-2 sm:px-3 dark:border-amber-800">
                {editable ? (
                  <div className="flex items-center gap-1">
                    <input
                      defaultValue={s.name}
                      placeholder="Название предмета"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== s.name) renameSubject(s, v);
                      }}
                      className="w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-center font-display text-sm font-semibold text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 dark:border-amber-700 dark:bg-slate-700 dark:text-slate-100"
                    />
                    <button
                      onClick={() => removeSubject(s)}
                      className="shrink-0 rounded-md p-1 text-amber-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                      title="Удалить предмет"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="text-center font-display text-base font-semibold text-slate-900 sm:text-lg dark:text-slate-100">
                    {s.name || '—'}
                  </div>
                )}
              </div>
            ))}
            {editable && <div className="border-l border-amber-200 dark:border-amber-800" />}
          </div>

          {/* Data rows */}
          <div className="divide-y divide-stone-100 dark:divide-slate-700">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-stretch"
                style={gridStyle}
              >
                <div className="flex items-center px-3 py-3 sm:px-4">
                  {editable ? (
                    <input
                      type="date"
                      value={r.due_date}
                      onChange={(e) => patchDate(r, e.target.value)}
                      className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {formatDate(r.due_date)}
                    </span>
                  )}
                </div>

                {subjects.map((s) => (
                  <div key={s.id} className="border-l border-stone-100 px-3 py-3 sm:px-4 dark:border-slate-700">
                    {editable ? (
                      <textarea
                        defaultValue={entries[r.id]?.[s.id] ?? ''}
                        rows={2}
                        placeholder="Задание"
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (entries[r.id]?.[s.id] ?? '')) patchEntry(r.id, s.id, v);
                        }}
                        className="w-full resize-y rounded-lg border border-stone-300 px-2 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                        {entries[r.id]?.[s.id] || <span className="text-stone-300 dark:text-slate-600">—</span>}
                      </p>
                    )}
                  </div>
                ))}

                {editable && (
                  <div className="flex items-center justify-center border-l border-stone-100 px-1 dark:border-slate-700">
                    <button
                      onClick={() => removeRow(r)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                      title="Удалить строку"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add subject row (editable only) */}
          {editable && (
            <div
              className="flex items-center gap-2 border-t border-stone-100 bg-stone-50 px-3 py-3 sm:px-4 dark:border-slate-700 dark:bg-slate-700/50"
            >
              <input
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubject()}
                placeholder="Новый предмет"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
              <button
                onClick={addSubject}
                disabled={!newSubjectName.trim() || saving}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
              >
                <Plus size={15} /> Добавить предмет
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile hint */}
      {colCount > 2 && (
        <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500 sm:hidden">
          Листайте таблицу горизонтально, чтобы увидеть все предметы
        </p>
      )}
    </section>
  );
}
