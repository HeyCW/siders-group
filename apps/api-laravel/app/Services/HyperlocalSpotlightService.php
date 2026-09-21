<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Article;
use App\Models\HyperlocalSpotlight;

/**
 * The hyperlocal spotlight: one global slot holding at most one editor-picked article
 * (openspec/changes/add-hyperlocal-spotlight). Mirrors HomeFeedService's composition style —
 * resolution happens here, server-side, so no consumer has to know a pick might be invisible.
 *
 * Two things are kept deliberately apart throughout this class: the *editor pick* (what is
 * stored in `hyperlocal_spotlight.article_id`, which may be absent or not currently visible) and
 * the *resolved* spotlight (what a reader would actually see right now — the editor pick when
 * it's visible, otherwise the most recently published article). Collapsing the two would make it
 * impossible for the admin screen to tell a deliberate pick from the automatic fallback.
 */
class HyperlocalSpotlightService
{
    /** The stored editor pick's article id, or null when none is set. Never throws when the
     *  seeded row is somehow missing — degrades to null exactly like an explicit NULL would. */
    public function getPickArticleId(): ?string
    {
        return $this->row()->article_id;
    }

    /** Makes `$articleId` the editor pick, replacing whatever it held before. Idempotent. Caller
     *  is responsible for wrapping this in the article write's own DB::transaction so the pick
     *  and the article save succeed or fail together. */
    public function setPick(string $articleId): void
    {
        $this->row()->update(['article_id' => $articleId]);
    }

    /** Releases the editor pick only if it currently points at `$articleId`; a no-op otherwise —
     *  saving an article that isn't the current pick must never clear someone else's pick. */
    public function clearIfHeldBy(string $articleId): void
    {
        $row = $this->row();

        if ($row->article_id === $articleId) {
            $row->update(['article_id' => null]);
        }
    }

    /**
     * The admin read: the stored editor pick (whatever its visibility) plus what the spotlight
     * currently resolves to publicly.
     *
     * @return array{editorPick: ?Article, editorPickVisible: bool, resolved: ?Article, resolvedIsEditorPick: bool}
     */
    public function resolveAdmin(): array
    {
        $pick = $this->pickArticle();
        $pickVisible = $pick !== null && $pick->isCurrentlyVisible();

        if ($pickVisible) {
            return ['editorPick' => $pick, 'editorPickVisible' => true, 'resolved' => $pick, 'resolvedIsEditorPick' => true];
        }

        return [
            'editorPick' => $pick,
            'editorPickVisible' => false,
            'resolved' => $this->newestPublished(),
            'resolvedIsEditorPick' => false,
        ];
    }

    /**
     * The public read: the resolved article, never disclosing an editor pick that isn't
     * currently publicly visible.
     *
     * @return array{article: ?Article, isEditorPick: bool}
     */
    public function resolvePublic(): array
    {
        $pick = $this->pickArticle();

        if ($pick !== null && $pick->isCurrentlyVisible()) {
            return ['article' => $pick, 'isEditorPick' => true];
        }

        return ['article' => $this->newestPublished(), 'isEditorPick' => false];
    }

    private function pickArticle(): ?Article
    {
        $articleId = $this->getPickArticleId();

        return $articleId !== null ? Article::find($articleId) : null;
    }

    /** Same newest-first, same-visibility query HomeFeedService backfills with — no second
     *  definition of "newest" and no second visibility rule. */
    private function newestPublished(): ?Article
    {
        return Article::publiclyVisible()->orderByDesc('published_at')->first();
    }

    /** `firstOrCreate` rather than a bare `first()`, so a database restored without the seed row
     *  degrades to recreating the empty slot instead of every read/write throwing
     *  (design.md - "Exactly one row, forever"). */
    private function row(): HyperlocalSpotlight
    {
        return HyperlocalSpotlight::firstOrCreate(['slot' => 'default'], ['article_id' => null]);
    }
}
