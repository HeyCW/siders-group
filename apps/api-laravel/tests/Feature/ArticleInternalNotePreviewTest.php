<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Article;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers openspec/changes/add-internal-editor-notes/specs/article-management/spec.md's "Article
 * preview" and "The staff preview is the one read that re-renders": the preview endpoint shows
 * internal notes, the public endpoints never do, and the preview is unreachable without
 * `news.manage`.
 */
class ArticleInternalNotePreviewTest extends TestCase
{
    use RefreshDatabase;

    /** The seeded `Owner` role — `OwnerRoleResolver` recognizes it by `is_system` alone, so this
     *  sidesteps seeding the whole permission catalog just to pass `permission:news.manage`. */
    private function ownerStaff(): User
    {
        $role = Role::create(['name' => 'Owner', 'slug' => 'owner', 'is_system' => true]);

        return User::create([
            'email' => Str::random(8).'@example.com',
            'password_hash' => bcrypt('secret'),
            'must_change_password' => false,
            'name' => 'Test Owner',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
    }

    /** A staff member with no permissions at all — not Owner, not granted `news.manage`. */
    private function unprivilegedStaff(): User
    {
        $role = Role::create(['name' => 'Nobody', 'slug' => Str::random(8), 'is_system' => false]);

        return User::create([
            'email' => Str::random(8).'@example.com',
            'password_hash' => bcrypt('secret'),
            'must_change_password' => false,
            'name' => 'Test Nobody',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
    }

    private function articleWithNote(User $author): Article
    {
        return Article::create([
            'title' => 'A Story With A Note',
            'slug' => Str::random(12),
            'body_json' => [
                'type' => 'doc',
                'content' => [
                    ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'The visible sentence.']]],
                    ['type' => 'internalNote', 'content' => [['type' => 'text', 'text' => 'confirm the spelling of the mayor’s name']]],
                ],
            ],
            // Simulates what the store/update write path actually produces: the note is absent
            // from the stored public HTML from the moment the article is saved.
            'body_html' => '<p>The visible sentence.</p>',
            'status' => 'published',
            'published_at' => now(),
            'author_id' => $author->id,
        ]);
    }

    public function test_preview_shows_the_internal_note(): void
    {
        $staff = $this->ownerStaff();
        $article = $this->articleWithNote($staff);

        $this->actingAs($staff, 'staff')
            ->getJson("/api/admin/articles/{$article->id}/preview")
            ->assertOk()
            ->assertJsonPath('data.title', 'A Story With A Note')
            ->assertSee('confirm the spelling', escape: false)
            ->assertSee('internal-note', escape: false);
    }

    public function test_preview_is_unreachable_without_news_manage(): void
    {
        $owner = $this->ownerStaff();
        $article = $this->articleWithNote($owner);
        $nobody = $this->unprivilegedStaff();

        $this->actingAs($nobody, 'staff')
            ->getJson("/api/admin/articles/{$article->id}/preview")
            ->assertForbidden();
    }

    public function test_preview_is_unreachable_without_authentication(): void
    {
        $article = $this->articleWithNote($this->ownerStaff());

        $this->getJson("/api/admin/articles/{$article->id}/preview")->assertUnauthorized();
    }

    public function test_public_detail_endpoint_never_discloses_the_note(): void
    {
        $article = $this->articleWithNote($this->ownerStaff());

        $response = $this->getJson("/api/articles/{$article->slug}")->assertOk();

        $this->assertStringNotContainsString('confirm the spelling', $response->getContent());
        $this->assertStringNotContainsString('internal-note', $response->getContent());
    }

    public function test_public_list_endpoint_never_discloses_the_note(): void
    {
        $this->articleWithNote($this->ownerStaff());

        $response = $this->getJson('/api/articles')->assertOk();

        $this->assertStringNotContainsString('confirm the spelling', $response->getContent());
        $this->assertStringNotContainsString('internal-note', $response->getContent());
    }

    public function test_preview_matches_the_public_rendering_for_an_article_with_no_notes(): void
    {
        $staff = $this->ownerStaff();
        $article = Article::create([
            'title' => 'Plain Story',
            'slug' => Str::random(12),
            'body_json' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Plain.']]]]],
            'body_html' => '<p>Plain.</p>',
            'status' => 'published',
            'published_at' => now(),
            'author_id' => $staff->id,
        ]);

        $preview = $this->actingAs($staff, 'staff')
            ->getJson("/api/admin/articles/{$article->id}/preview")
            ->assertOk()
            ->json('data.bodyHtml');
        $public = $this->getJson("/api/articles/{$article->slug}")->assertOk()->json('data.bodyHtml');

        $this->assertSame($public, $preview);
    }
}
