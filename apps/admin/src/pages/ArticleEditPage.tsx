import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Editor, Range } from '@tiptap/core';
import type { ArticleAdminResponse, ArticlePublicDetail, CategoryResponse, TagResponse } from '@siders/contracts';
import { articlesApi } from '../lib/articlesApi.js';
import { categoriesApi, tagsApi } from '../lib/taxonomyApi.js';
import { mediaApi } from '../lib/mediaApi.js';
import { ApiError } from '../lib/api.js';
import { EditorCanvas } from '../editor/EditorCanvas.js';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { useDarkMode } from '../hooks/useDarkMode.js';
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

/** The admin article authoring and management view: canvas, metadata sidebar, lifecycle
 *  actions, focus mode, and dark mode — see specs/article-editor/spec.md and
 *  specs/article-management/spec.md for the requirements this implements. */
export function ArticleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isDark, toggleDark] = useDarkMode();
  const [focusMode, setFocusMode] = useState(false);

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
        excerpt: formRef.current.excerpt || undefined,
        categoryIds: formRef.current.categoryIds,
        tagIds: formRef.current.tagIds,
        featuredMediaId: formRef.current.featuredMediaId,
        seoTitle: formRef.current.seoTitle || undefined,
        seoDescription: formRef.current.seoDescription || undefined,
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

  async function handleFileChosen(file: File) {
    const pending = pendingInsertRef.current;
    pendingInsertRef.current = null;
    if (!pending) return;
    try {
      const uploaded = await mediaApi.upload(file);
      pending.editor.chain().focus().deleteRange(pending.range).setImage({ src: uploaded.url, alt: '' }).run();
    } catch (err) {
      window.alert(errorMessage(err, 'Image upload failed'));
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

  if (loadError) return <div className="p-8 text-red-600 dark:text-red-400">{loadError}</div>;
  if (!article || !form) return <div className="p-8 text-gray-500 dark:text-gray-400">Loading…</div>;

  const permissionDenied =
    publishState.forbidden || unpublishState.forbidden || deleteState.forbidden || scheduleState.forbidden;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      {!focusMode && (
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
          <Link to="/articles" className="text-sm text-gray-500 hover:underline dark:text-gray-400">
            ← Articles
          </Link>
          <div className="flex items-center gap-3">
            <SaveStatusIndicator status={saveStatus} errorMessage={saveError} />
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {article.status}
            </span>
            <button
              type="button"
              onClick={handlePreview}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs dark:border-gray-600"
            >
              Preview
            </button>
            {article.status !== 'published' && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishState.loading}
                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs text-white disabled:opacity-50"
              >
                Publish
              </button>
            )}
            {article.status === 'published' && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={unpublishState.loading}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs dark:border-gray-600"
              >
                Unpublish
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteState.loading}
              className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-600 dark:border-red-800 dark:text-red-400"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setFocusMode(true)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs dark:border-gray-600"
            >
              Focus mode
            </button>
            <button
              type="button"
              onClick={toggleDark}
              aria-label="Toggle dark mode"
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs dark:border-gray-600"
            >
              {isDark ? '☀' : '🌙'}
            </button>
          </div>
        </header>
      )}

      {permissionDenied && (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
          You don&apos;t have permission to perform that action.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <input
            value={form.title}
            onChange={(e) => patchForm({ title: e.target.value })}
            placeholder="Title"
            className="mx-auto mt-8 block w-full max-w-3xl border-none bg-transparent px-4 text-4xl font-bold text-gray-900 outline-none placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600"
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
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 p-4 dark:border-gray-700">
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Slug
                </label>
                <input
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  onBlur={commitSlug}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
                {slugError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{slugError}</p>}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Featured image
                </label>
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
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Excerpt
                </label>
                <textarea
                  value={form.excerpt}
                  onChange={(e) => patchForm({ excerpt: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
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
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  SEO title
                </label>
                <input
                  value={form.seoTitle}
                  onChange={(e) => patchForm({ seoTitle: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  SEO description
                </label>
                <textarea
                  value={form.seoDescription}
                  onChange={(e) => patchForm({ seoDescription: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </div>

              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Schedule publish
                </label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
                <button
                  type="button"
                  onClick={handleSchedule}
                  disabled={scheduleState.loading || !scheduleAt}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-gray-600"
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
          className="fixed bottom-4 right-4 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs shadow dark:border-gray-600 dark:bg-gray-800"
        >
          Exit focus mode
        </button>
      )}

      {previewArticle && <PreviewModal article={previewArticle} onClose={() => setPreviewArticle(null)} />}
    </div>
  );
}
