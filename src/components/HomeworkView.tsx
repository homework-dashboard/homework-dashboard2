import { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  CalendarDays,
  Lock,
  X,
  Link2,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import type { Lesson, Homework, HomeworkSubject } from '@/types';
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

function sortHomeworkRows(rows: Homework[]) {
  return [...rows].sort((a, b) => {
    const dateCompare = b.due_date.localeCompare(a.due_date);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return b.created_at.localeCompare(a.created_at);
  });
}

export default function HomeworkView({
  lessonSlug,
  teacherSlug,
  editMode,
  isAdmin,
  myProfile,
}: Props) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [rows, setRows] = useState<Homework[]>([]);
  const [subjects, setSubjects] = useState<HomeworkSubject[]>([]);
  const [
    entries,
    setEntries,
  ] = useState<
    Record<string, Record<string, { content: string; link_url: string }>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

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
          // Новые даты сверху, старые снизу
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
          .select('homework_id, subject_id, content, link_url'),
      ]);

      if (hwRes.error) {
        setError(hwRes.error.message);
      } else if (subjRes.error) {
        setError(subjRes.error.message);
      } else if (entRes.error) {
        setError(entRes.error.message);
      } else {
        setRows(sortHomeworkRows(hwRes.data ?? []));
        setSubjects(subjRes.data ?? []);

        const entMap: Record<
          string,
          Record<string, { content: string; link_url: string }>
        > = {};

        for (const e of entRes.data ?? []) {
          if (!entMap[e.homework_id]) {
            entMap[e.homework_id] = {};
          }

          entMap[e.homework_id][e.subject_id] = {
            content: e.content,
            link_url: e.link_url ?? '',
          };
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
    if (subjects.length > 0) {
      return subjects[0].id;
    }

    const { data, error } = await supabase
      .from('homework_subjects')
      .insert({
        lesson_id: lesson?.id,
        name: lesson?.subject || 'Предмет',
        sort_order: 0,
      })
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
    if (saving || !editable || !lesson) {
      return;
    }

    setSaving(true);

    const subjId = await ensureDefaultSubject();

    if (!subjId) {
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('homework')
      .insert({
        lesson_id: lesson.id,
        due_date: today(),
        solfeggio: '',
        music_literature: '',
      })
      .select()
      .maybeSingle();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data) {
      // Добавляем строку и сразу сохраняем порядок:
      // новые даты сверху
      setRows((prev) => sortHomeworkRows([...prev, data]));

      setEntries((prev) => ({
        ...prev,
        [data.id]: {},
      }));
    }
  };

  const patchDate = async (row: Homework, due_date: string) => {
    // Сразу обновляем дату и пересортировываем строки на экране
    setRows((prev) =>
      sortHomeworkRows(
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                due_date,
              }
            : item
        )
      )
    );

    const { error } = await supabase
      .from('homework')
      .update({ due_date })
      .eq('id', row.id);

    if (error) {
      setError(error.message);
    }
  };

  const upsertEntry = async (
    hwId: string,
    subjId: string,
    patch: { content?: string; link_url?: string }
  ) => {
    setEntries((prev) => {
      const current = prev[hwId]?.[subjId] ?? {
        content: '',
        link_url: '',
      };

      return {
        ...prev,
        [hwId]: {
          ...(prev[hwId] ?? {}),
          [subjId]: {
            ...current,
            ...patch,
          },
        },
      };
    });

    const { data: existing } = await supabase
      .from('homework_entries')
      .select('id')
      .eq('homework_id', hwId)
      .eq('subject_id', subjId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('homework_entries')
        .update(patch)
        .eq('id', existing.id);
    } else {
      await supabase.from('homework_entries').insert({
        homework_id: hwId,
        subject_id: subjId,
        content: patch.content ?? '',
        link_url: patch.link_url ?? null,
      });
    }
  };

  const copyRow = async (row: Homework) => {
    const sections = subjects.reduce<string[]>((result, subject) => {
      const entry = entries[row.id]?.[subject.id] ?? {
        content: '',
        link_url: '',
      };

      if (!entry.content.trim() && !entry.link_url.trim()) {
        return result;
      }

      const lines = [
        `${subject.name || 'Без названия'}: ${entry.content.trim()}`,
      ];

      if (entry.link_url.trim()) {
        lines.push(entry.link_url.trim());
      }

      result.push(lines.join('\n'));

      return result;
    }, []);

    const parts: string[] = [formatDate(row.due_date), ''];

    for (let i = 0; i < sections.length; i++) {
      if (i > 0) {
        parts.push('');
      }

      parts.push(sections[i]);
    }

    const text = parts.join('\n');

    let copied = false;

    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const textarea = document.createElement('textarea');

      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';

      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();

      try {
        document.execCommand('copy');
        copied = true;
      } catch {
        // Ignore copy error
      }

      document.body.removeChild(textarea);
    }

    if (copied) {
      setCopiedRowId(row.id);

      window.setTimeout(() => {
        setCopiedRowId((current) =>
          current === row.id ? null : current
        );
      }, 1800);
    } else {
      setError('Не удалось скопировать задание');
    }
  };

  const removeRow = async (row: Homework) => {
    if (!confirm('Удалить эту строку задания?')) {
      return;
    }

    setRows((prev) => prev.filter((item) => item.id !== row.id));

    const { error } = await supabase
      .from('homework')
      .delete()
      .eq('id', row.id);

    if (error) {
      setError(error.message);
    }
  };

  const renameSubject = async (
    subject: HomeworkSubject,
    name: string
  ) => {
    setSubjects((prev) =>
      prev.map((item) =>
        item.id === subject.id
          ? {
              ...item,
              name,
            }
          : item
      )
    );

    const { error } = await supabase
      .from('homework_subjects')
      .update({ name })
      .eq('id', subject.id);

    if (error) {
      setError(error.message);
    }
  };

  const addSubject = async () => {
    const name = newSubjectName.trim();

    if (!name || saving || !editable || !lesson) {
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('homework_subjects')
      .insert({
        lesson_id: lesson.id,
        name,
        sort_order: subjects.length,
      })
      .select()
      .maybeSingle();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data) {
      setSubjects((prev) => [...prev, data]);
    }

    setNewSubjectName('');
  };

  const removeSubject = async (subject: HomeworkSubject) => {
    if (
      !confirm(
        `Удалить предмет «${
          subject.name || 'без названия'
        }» и все задания в нём?`
      )
    ) {
      return;
    }

    setSubjects((prev) =>
      prev.filter((item) => item.id !== subject.id)
    );

    const { error } = await supabase
      .from('homework_subjects')
      .delete()
      .eq('id', subject.id);

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
      ]
        .filter(Boolean)
        .join(' · ') || 'Класс'
    : '…';

  const colCount = subjects.length;
  const dateColW = 'minmax(150px, 170px)';
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
          <h1 className="truncate font-display text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-100">
            {title}
          </h1>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Домашние задания по датам.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editMode && !canEdit && (
            <span className="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              <Lock size={12} />
              Только просмотр
            </span>
          )}

          {editable && (
            <button
              onClick={addRow}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
            >
              <Plus size={16} />
              Добавить дату
            </button>
          )}
        </div>
      </div>

      {loading || error ? (
        <StateBlock loading={loading} error={error} />
      ) : rows.length === 0 && !editable ? (
        <StateBlock
          empty
          emptyText="Задания пока не добавлены"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div
            className="flex items-stretch border-b-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
            style={gridStyle}
          >
            <div className="flex items-center gap-1.5 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-amber-800 sm:px-4 dark:text-amber-400">
              <CalendarDays
                size={14}
                className="shrink-0"
              />

              <span className="hidden sm:inline">
                Дата
              </span>
            </div>

            {subjects.map((subject) => (
              <div
                key={subject.id}
                className="border-l border-amber-200 px-2 py-2 sm:px-3 dark:border-amber-800"
              >
                {editable ? (
                  <div className="flex items-center gap-1">
                    <input
                      defaultValue={subject.name}
                      placeholder="Название предмета"
                      onBlur={(event) => {
                        const value =
                          event.target.value.trim();

                        if (value !== subject.name) {
                          renameSubject(subject, value);
                        }
                      }}
                      className="w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-center font-display text-sm font-semibold text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 dark:border-amber-700 dark:bg-slate-700 dark:text-slate-100"
                    />

                    <button
                      onClick={() => removeSubject(subject)}
                      className="shrink-0 rounded-md p-1 text-amber-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                      title="Удалить предмет"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="text-center font-display text-base font-semibold text-slate-900 sm:text-lg dark:text-slate-100">
                    {subject.name || '—'}
                  </div>
                )}
              </div>
            ))}

            {editable && (
              <div className="border-l border-amber-200 dark:border-amber-800" />
            )}
          </div>

          <div className="divide-y divide-stone-100 dark:divide-slate-700">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-stretch"
                style={gridStyle}
              >
                <div className="flex items-center px-3 py-3 sm:px-4">
                  {editable ? (
                    <input
                      type="date"
                      value={row.due_date}
                      onChange={(event) =>
                        patchDate(
                          row,
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-start gap-3">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {formatDate(row.due_date)}
                      </span>

                      <button
                        onClick={() => copyRow(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/30"
                        title="Скопировать всё задание на эту дату"
                      >
                        {copiedRowId === row.id ? (
                          <Check size={13} />
                        ) : (
                          <Copy size={13} />
                        )}

                        {copiedRowId === row.id
                          ? 'Скопировано'
                          : 'Копировать'}
                      </button>
                    </div>
                  )}
                </div>

                {subjects.map((subject) => {
                  const entry = entries[row.id]?.[subject.id] ?? {
                    content: '',
                    link_url: '',
                  };

                  return (
                    <div
                      key={subject.id}
                      className="border-l border-stone-100 px-3 py-3 sm:px-4 dark:border-slate-700"
                    >
                      {editable ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            defaultValue={entry.content}
                            rows={2}
                            placeholder="Задание"
                            onBlur={(event) => {
                              const value =
                                event.target.value;

                              if (value !== entry.content) {
                                upsertEntry(
                                  row.id,
                                  subject.id,
                                  { content: value }
                                );
                              }
                            }}
                            className="w-full resize-y rounded-lg border border-stone-300 px-2 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                          />

                          <div className="flex items-center gap-1.5">
                            <Link2
                              size={14}
                              className="shrink-0 text-slate-400 dark:text-slate-500"
                            />

                            <input
                              type="url"
                              defaultValue={entry.link_url}
                              placeholder="Ссылка на файл или папку"
                              onBlur={(event) => {
                                const value =
                                  event.target.value.trim();

                                if (value !== entry.link_url) {
                                  upsertEntry(
                                    row.id,
                                    subject.id,
                                    { link_url: value }
                                  );
                                }
                              }}
                              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full flex-col gap-2">
                          <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">
                            {entry.content || (
                              <span className="text-stone-300 dark:text-slate-600">
                                —
                              </span>
                            )}
                          </p>

                          {entry.link_url && (
                            <a
                              href={entry.link_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-auto flex w-full max-w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-center text-xs font-semibold leading-tight text-white transition-colors hover:bg-amber-700 sm:w-fit sm:px-3"
                            >
                              <ExternalLink
                                size={13}
                                className="shrink-0"
                              />

                              <span className="min-w-0 whitespace-normal break-normal">
                                Открыть материал
                              </span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {editable && (
                  <div className="flex items-center justify-center border-l border-stone-100 px-1 dark:border-slate-700">
                    <button
                      onClick={() => removeRow(row)}
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

          {editable && (
            <div
              className="border-t border-stone-100 bg-stone-50 px-3 py-3 sm:px-4 dark:border-slate-700 dark:bg-slate-700/50"
              style={gridStyle}
            >
              <div
                className="flex items-center gap-2"
                style={{ gridColumn: '1 / -1' }}
              >
                <input
                  value={newSubjectName}
                  onChange={(event) =>
                    setNewSubjectName(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      addSubject();
                    }
                  }}
                  placeholder="Новый предмет"
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />

                <button
                  onClick={addSubject}
                  disabled={
                    !newSubjectName.trim() || saving
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
                >
                  <Plus size={15} />
                  Добавить предмет
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {colCount > 2 && (
        <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500 sm:hidden">
          Листайте таблицу горизонтально, чтобы увидеть все предметы
        </p>
      )}
    </section>
  );
}