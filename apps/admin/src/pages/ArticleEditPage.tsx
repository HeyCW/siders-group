import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Editor, Range } from '@tiptap/core';
import type { ArticleAdminResponse, ArticlePublicDetail, CategoryResponse, TagResponse } from '@siders/contracts';
import { articlesApi } from '../lib/articlesApi.js';
import { categoriesApi, tagsApi } from '../lib/taxonomyApi.js';
import { mediaApi } from '../lib/mediaApi.js';
import { ApiError } from '../lib/api.js';
import { ARTICLE_STATUS_STYLES } from '../lib/articleStatusStyles.js';
import { EditorCanvas } from '../editor/EditorCanvas.js';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { useChrome } from '../context/ChromeContext.js';
import { SaveStatusIndicator, type SaveStatus } from '../components/SaveStatusIndicator.js';
import { MultiSelectChips } from '../components/MultiSelectChips.js';
import { PreviewModal } from '../components/PreviewModal.js';

interface FormState {
  title: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  categoryIds: string[];
  tagIds: string[];
  featuredMediaId: string | null;
  featuredImageUrl: string | null;
  bodyJson: unknown;
}

function toFormState(article: ArticleAdminResponse): FormState {
  return {
    title: article.title,
    excerpt: article.excerpt ?? '',
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
    categoryIds: article.categories.map((c) => c.id),
    tagIds: article.tags.map((t) => t.id),
    featuredMediaId: article.featuredMediaId,
    featuredImageUrl: article.featuredImageUrl,
    bodyJson: article.bodyJson,
  };
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

const FIELD_LABEL = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]';
const FIELD_INPUT =
  'w-full rounded-md border border-[var(--rule)] bg-transparent px-2 py-1 text-sm focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20';
const OUTLINE_BUTTON =
  'rounded-md border border-[var(--rule)] px-2.5 py-1 text-xs transition-colors hover:border-[var(--ink)]/30';

/** The admin article authoring and management view: canvas, metadata sidebar, lifecycle
 *  actions, focus mode, and dark mode — see specs/article-editor/spec.md and
 *  specs/article-management/spec.md for the requirements this implements. */
export function ArticleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [focusMode, setFocusMode] = useState(false);
  const { setHideChrome } = useChrome();
  useEffect(() => {
    setHideChrome(focusMode);
    return () => setHideChrome(false);
  }, [focusMode, setHideChrome]);

  const [article, setArticle] = useState<ArticleAdminResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const formRef = useRef<FormState | null>(null);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const [slugInput, setSlugInput] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [previewArticle, setPreviewArticle] = useState<ArticlePublicDetail | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    articlesApi
      .get(id)
      .then((loaded) => {
        setArticle(loaded);
        setForm(toFormState(loaded));
        setSlugInput(loaded.slug);
      })
      .catch((err: unknown) => setLoadError(errorMessage(err, 'Could not load article')));
    Promise.all([categoriesApi.list(), tagsApi.list()])
      .then(([c, t]) => {
        setCategories(c);
        setTags(t);
      })
      .catch((err: unknown) => setTaxonomyError(errorMessage(err, 'Could not load categories and tags')));
  }, [id]);

  const debouncedSave = useDebouncedCallback(async () => {
    if (!id || !formRef.current) return;
    setSaveStatus('saving');
    try {
      const updated = await articlesApi.autosave(id, {
        title: formRef.current.title,
        bodyJson: formRef.current.bodyJson,
        // Sent as-is, not `|| undefined`: the service treats an `undefined` field as "don't
        // touch this", so coercing an empty string to undefined here would make clearing the
        // field impossible — the save would report success while silently leaving the old
        // value in place. An empty string is a valid, intentional value for all three
        // (articleAutosaveRequestSchema has no `.min()` on any of them).
        excerpt: formRef.current.excerpt,
        categoryIds: formRef.current.categoryIds,
        tagIds: formRef.current.tagIds,
        featuredMediaId: formRef.current.featuredMediaId,
        seoTitle: formRef.current.seoTitle,
        seoDescription: formRef.current.seoDescription,
      });
      setArticle(updated);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(errorMessage(err, 'Could not save'));
    }
  }, 1200);

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    debouncedSave();
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingInsertRef = useRef<{ editor: Editor; range: Range } | null>(null);

  const onImageCommand = useCallback((invocation: { editor: Editor; range: Range }) => {
    pendingInsertRef.current = invocation;
    fileInputRef.current?.click();
  }, []);

  const onVideoCommand = useCallback((invocation: { editor: Editor; range: Range }) => {
    const url = window.prompt('Video URL');
    if (!url) return;
    invocation.editor
      .chain()
      .focus()
      .deleteRange(invocation.range)
      .insertContent({ type: 'video', attrs: { src: url } })
      .run();
  }, []);

  /**
   * The upload is awaited while the editor stays live, so the range captured when `/image` ran
   * can be stale by the time we come back: the user may have typed, undone, or navigated away.
   * ProseMirror's `deleteRange` throws `RangeError` on an out-of-bounds position, and deleting a
   * still-in-bounds but shifted range would silently eat unrelated text — so the range is only
   * used when the editor is alive and the document is still at least that long.
   */
  function removeTriggerText(pending: { editor: Editor; range: Range }): boolean {
    if (pending.editor.isDestroyed) return false;
    if (pending.range.to > pending.editor.state.doc.content.size) return false;
    try {
      return pending.editor.chain().focus().deleteRange(pending.range).run();
    } catch {
      return false;
    }
  }

  async function handleFileChosen(file: File) {
    const pending = pendingInsertRef.current;
    pendingInsertRef.current = null;
    if (!pending) return;
    let uploaded: Awaited<ReturnType<typeof mediaApi.upload>>;
    try {
      uploaded = await mediaApi.upload(file);
    } catch (err) {
      // Reported before touching the document: the `/image` trigger cleanup below is best-effort
      // and must never be able to throw away the only feedback the user gets about the failure.
      window.alert(errorMessage(err, 'Image upload failed'));
      removeTriggerText(pending);
      return;
    }
    if (pending.editor.isDestroyed) return;
    if (removeTriggerText(pending)) {
      pending.editor.chain().focus().setImage({ src: uploaded.url, alt: '' }).run();
    }
  }

  async function handleFeaturedImageChosen(file: File) {
    try {
      const uploaded = await mediaApi.upload(file);
      patchForm({ featuredMediaId: uploaded.id, featuredImageUrl: uploaded.url });
    } catch (err) {
      window.alert(errorMessage(err, 'Image upload failed'));
    }
  }

  async function commitSlug() {
    if (!id || !article || slugInput === article.slug) return;
    try {
      const updated = await articlesApi.update(id, { slug: slugInput });
      setArticle(updated);
      setSlugError(null);
    } catch (err) {
      setSlugError(errorMessage(err, 'Could not update slug'));
      setSlugInput(article.slug);
    }
  }

  const [publishState, runPublish] = useAsyncAction(articlesApi.publish);
  const [unpublishState, runUnpublish] = useAsyncAction(articlesApi.unpublish);
  const [scheduleState, runSchedule] = useAsyncAction(articlesApi.schedule);
  const [deleteState, runDelete] = useAsyncAction(articlesApi.remove);

  async function handlePublish() {
    if (!id) return;
    try {
      setArticle(await runPublish(id));
    } catch {
      /* surfaced via publishState.errorMessage */
    }
  }

  async function handleUnpublish() {
    if (!id) return;
    try {
      setArticle(await runUnpublish(id));
    } catch {
      /* surfaced via unpublishState.errorMessage */
    }
  }

  async function handleSchedule() {
    if (!id || !scheduleAt) return;
    try {
      setArticle(await runSchedule(id, { publishedAt: new Date(scheduleAt).toISOString() }));
    } catch {
      /* surfaced via scheduleState.errorMessage */
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Delete this article? This cannot be undone.')) return;
    try {
      await runDelete(id);
      navigate('/articles');
    } catch {
      /* surfaced via deleteState.errorMessage; stay on the page */
    }
  }

  async function handlePreview() {
    if (!id) return;
    try {
      setPreviewArticle(await articlesApi.preview(id));
    } catch (err) {
      window.alert(errorMessage(err, 'Could not load preview'));
    }
  }

  if (loadError)
    return (
      <div className="siders-scope flex h-full min-h-full items-center justify-center bg-[var(--paper)] p-8 text-red-600 dark:text-red-400">
        {loadError}
      </div>
    );
  if (!article || !form)
    return (
      <div className="siders-scope flex h-full min-h-full items-center justify-center bg-[var(--paper)] p-8 font-mono text-sm text-[var(--muted)]">
        Loading…
      </div>
    );

  const permissionDenied =
    publishState.forbidden || unpublishState.forbidden || deleteState.forbidden || scheduleState.forbidden;
  const statusStyle = ARTICLE_STATUS_STYLES[article.status];

  return (
    <div className="siders-scope flex h-full flex-col bg-[var(--paper)] text-[var(--ink)]">
      {!focusMode && (
        <header className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2">
          <Link to="/articles" className="text-sm text-[var(--muted)] hover:text-[var(--ink)] hover:underline">
            ← Articles
          </Link>
          <div className="flex items-center gap-3">
            <SaveStatusIndicator status={saveStatus} errorMessage={saveError} />
            <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${statusStyle.chip}`}>
              {article.status}
            </span>
            <button type="button" onClick={handlePreview} className={OUTLINE_BUTTON}>
              Preview
            </button>
            {article.status !== 'published' && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishState.loading}
                className="rounded-md bg-[var(--signal)] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
              >
                Publish
              </button>
            )}
            {article.status === 'published' && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={unpublishState.loading}
                className={OUTLINE_BUTTON}
              >
                Unpublish
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteState.loading}
              className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-600 transition-colors hover:border-red-400 dark:border-red-800 dark:text-red-400"
            >
              Delete
            </button>
            <button type="button" onClick={() => setFocusMode(true)} className={OUTLINE_BUTTON}>
              Focus mode
            </button>
          </div>
        </header>
      )}

      {permissionDenied && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          You don&apos;t have permission to perform that action.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <input
            value={form.title}
            onChange={(e) => patchForm({ title: e.target.value })}
            placeholder="Title"
            className="mx-auto mt-8 block w-full max-w-3xl border-none bg-transparent px-4 font-display text-4xl text-[var(--ink)] outline-none placeholder:text-[var(--muted)]/40"
          />
          <EditorCanvas
            initialContent={form.bodyJson}
            onUpdate={(json) => patchForm({ bodyJson: json })}
            onImageCommand={onImageCommand}
            onVideoCommand={onVideoCommand}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChosen(file);
              e.target.value = '';
            }}
          />
        </main>

        {!focusMode && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-[var(--rule)] p-4">
            <div className="space-y-5">
              <div>
                <label className={FIELD_LABEL}>Slug</label>
                <input value={slugInput} onChange={(e) => setSlugInput(e.target.value)} onBlur={commitSlug} className={FIELD_INPUT} />
                {slugError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{slugError}</p>}
              </div>

              <div>
                <label className={FIELD_LABEL}>Featured image</label>
                {form.featuredImageUrl && (
                  <img src={form.featuredImageUrl} alt="" className="mb-2 w-full rounded-md" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFeaturedImageChosen(file);
                  }}
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className={FIELD_LABEL}>Excerpt</label>
                <textarea value={form.excerpt} onChange={(e) => patchForm({ excerpt: e.target.value })} rows={3} className={FIELD_INPUT} />
              </div>

              {taxonomyError && <p className="text-xs text-red-600 dark:text-red-400">{taxonomyError}</p>}
              <MultiSelectChips
                label="Categories"
                options={categories}
                selectedIds={form.categoryIds}
                onChange={(ids) => patchForm({ categoryIds: ids })}
              />
              <MultiSelectChips
                label="Tags"
                options={tags}
                selectedIds={form.tagIds}
                onChange={(ids) => patchForm({ tagIds: ids })}
              />

              <div>
                <label className={FIELD_LABEL}>SEO title</label>
                <input value={form.seoTitle} onChange={(e) => patchForm({ seoTitle: e.target.value })} className={FIELD_INPUT} />
              </div>
              <div>
                <label className={FIELD_LABEL}>SEO description</label>
                <textarea
                  value={form.seoDescription}
                  onChange={(e) => patchForm({ seoDescription: e.target.value })}
                  rows={2}
                  className={FIELD_INPUT}
                />
              </div>

              <div className="border-t border-[var(--rule)] pt-4">
                <label className={FIELD_LABEL}>Schedule publish</label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className={`mb-2 ${FIELD_INPUT}`}
                />
                <button
                  type="button"
                  onClick={handleSchedule}
                  disabled={scheduleState.loading || !scheduleAt}
                  className="w-full rounded-md bg-[var(--signal)] px-2 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
                >
                  Schedule
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {focusMode && (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          className="fixed bottom-4 right-4 rounded-full border border-[var(--rule)] bg-[var(--paper)] px-3 py-1.5 text-xs text-[var(--ink)] shadow"
        >
          Exit focus mode
        </button>
      )}

      {previewArticle && <PreviewModal article={previewArticle} onClose={() => setPreviewArticle(null)} />}
    </div>
  );
}
