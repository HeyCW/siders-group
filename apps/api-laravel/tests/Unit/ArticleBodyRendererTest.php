<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\ArticleBodyRenderer;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** Mirrors apps/api/src/lib/sanitizeHtml.test.ts case-for-case so the two backends stay in lockstep. */
class ArticleBodyRendererTest extends TestCase
{
    /** @param array<int, array<string, mixed>> $marks */
    private function text(string $value, array $marks = []): array
    {
        return ['type' => 'text', 'text' => $value, 'marks' => $marks];
    }

    private function doc(array ...$content): array
    {
        return ['type' => 'doc', 'content' => $content];
    }

    #[Test]
    public function it_renders_a_paragraph(): void
    {
        $doc = $this->doc(['type' => 'paragraph', 'content' => [$this->text('hello')]]);
        $this->assertSame('<p>hello</p>', ArticleBodyRenderer::render($doc));
    }

    #[Test]
    public function it_renders_headings_h1_to_h3(): void
    {
        foreach ([1, 2, 3] as $level) {
            $doc = $this->doc(['type' => 'heading', 'attrs' => ['level' => $level], 'content' => [$this->text('Title')]]);
            $this->assertSame("<h{$level}>Title</h{$level}>", ArticleBodyRenderer::render($doc));
        }
    }

    #[Test]
    public function it_renders_bold_italic_underline_and_strikethrough_marks(): void
    {
        $this->assertSame(
            '<p><strong>b</strong></p>',
            ArticleBodyRenderer::render($this->doc(['type' => 'paragraph', 'content' => [$this->text('b', [['type' => 'bold']])]])),
        );
        $this->assertSame(
            '<p><em>i</em></p>',
            ArticleBodyRenderer::render($this->doc(['type' => 'paragraph', 'content' => [$this->text('i', [['type' => 'italic']])]])),
        );
        $this->assertSame(
            '<p><u>u</u></p>',
            ArticleBodyRenderer::render($this->doc(['type' => 'paragraph', 'content' => [$this->text('u', [['type' => 'underline']])]])),
        );
        $this->assertSame(
            '<p><s>s</s></p>',
            ArticleBodyRenderer::render($this->doc(['type' => 'paragraph', 'content' => [$this->text('s', [['type' => 'strike']])]])),
        );
    }

    #[Test]
    public function it_renders_a_link_with_a_safe_href(): void
    {
        $doc = $this->doc([
            'type' => 'paragraph',
            'content' => [$this->text('click', [['type' => 'link', 'attrs' => ['href' => 'https://siders.id/x']]])],
        ]);
        $this->assertSame(
            '<p><a href="https://siders.id/x" rel="noopener noreferrer nofollow" target="_blank">click</a></p>',
            ArticleBodyRenderer::render($doc),
        );
    }

    #[Test]
    public function it_renders_a_block_quote(): void
    {
        $doc = $this->doc(['type' => 'blockquote', 'content' => [['type' => 'paragraph', 'content' => [$this->text('q')]]]]);
        $this->assertSame('<blockquote><p>q</p></blockquote>', ArticleBodyRenderer::render($doc));
    }

    #[Test]
    public function it_renders_a_code_block_with_an_allowlisted_language_class(): void
    {
        $doc = $this->doc([
            'type' => 'codeBlock',
            'attrs' => ['language' => 'ts'],
            'content' => [['type' => 'text', 'text' => 'const x = 1;']],
        ]);
        $this->assertSame('<pre><code class="language-ts">const x = 1;</code></pre>', ArticleBodyRenderer::render($doc));
    }

    #[Test]
    public function it_renders_an_ordered_list_and_an_unordered_list(): void
    {
        $bullet = $this->doc([
            'type' => 'bulletList',
            'content' => [['type' => 'listItem', 'content' => [['type' => 'paragraph', 'content' => [$this->text('a')]]]]],
        ]);
        $this->assertSame('<ul><li><p>a</p></li></ul>', ArticleBodyRenderer::render($bullet));

        $ordered = $this->doc([
            'type' => 'orderedList',
            'content' => [['type' => 'listItem', 'content' => [['type' => 'paragraph', 'content' => [$this->text('a')]]]]],
        ]);
        $this->assertSame('<ol><li><p>a</p></li></ol>', ArticleBodyRenderer::render($ordered));
    }

    #[Test]
    public function it_renders_a_checklist_with_checked_state(): void
    {
        $doc = $this->doc([
            'type' => 'taskList',
            'content' => [
                ['type' => 'taskItem', 'attrs' => ['checked' => true], 'content' => [['type' => 'paragraph', 'content' => [$this->text('done')]]]],
                ['type' => 'taskItem', 'attrs' => ['checked' => false], 'content' => [['type' => 'paragraph', 'content' => [$this->text('todo')]]]],
            ],
        ]);
        $html = ArticleBodyRenderer::render($doc);
        $this->assertStringContainsString('data-checked="true"', $html);
        $this->assertStringContainsString('checked><p>done</p>', $html);
        $this->assertStringContainsString('data-checked="false"', $html);
        $this->assertStringNotContainsString('disabled checked><p>todo</p>', $html);
    }

    #[Test]
    public function it_renders_a_table(): void
    {
        $doc = $this->doc([
            'type' => 'table',
            'content' => [
                [
                    'type' => 'tableRow',
                    'content' => [
                        ['type' => 'tableHeader', 'content' => [['type' => 'paragraph', 'content' => [$this->text('H')]]]],
                        ['type' => 'tableCell', 'content' => [['type' => 'paragraph', 'content' => [$this->text('D')]]]],
                    ],
                ],
            ],
        ]);
        $this->assertSame(
            '<table><tbody><tr><th><p>H</p></th><td><p>D</p></td></tr></tbody></table>',
            ArticleBodyRenderer::render($doc),
        );
    }

    #[Test]
    public function it_renders_an_image_with_caption_and_alignment(): void
    {
        $doc = $this->doc([
            'type' => 'image',
            'attrs' => ['src' => '/media/2026/08/x.webp', 'alt' => 'desc', 'width' => 400, 'align' => 'left', 'caption' => 'A caption'],
        ]);
        $this->assertSame(
            '<figure class="align-left"><img src="/media/2026/08/x.webp" alt="desc" width="400"><figcaption>A caption</figcaption></figure>',
            ArticleBodyRenderer::render($doc),
        );
    }

    #[Test]
    public function it_renders_a_horizontal_divider(): void
    {
        $this->assertSame('<hr>', ArticleBodyRenderer::render($this->doc(['type' => 'horizontalRule'])));
    }

    #[Test]
    public function it_renders_a_video_embed_as_an_inert_link_never_an_iframe(): void
    {
        $doc = $this->doc(['type' => 'video', 'attrs' => ['src' => 'https://youtube.com/watch?v=abc']]);
        $html = ArticleBodyRenderer::render($doc);
        $this->assertStringContainsString('<a href="https://youtube.com/watch?v=abc"', $html);
        $this->assertStringNotContainsString('<iframe', $html);
    }

    #[Test]
    public function it_omits_an_internal_note_from_the_default_public_rendering(): void
    {
        $doc = $this->doc(
            ['type' => 'paragraph', 'content' => [$this->text('before')]],
            ['type' => 'internalNote', 'content' => [$this->text('confirm the spelling before this runs')]],
            ['type' => 'paragraph', 'content' => [$this->text('after')]],
        );
        $html = ArticleBodyRenderer::render($doc);
        $this->assertSame('<p>before</p><p>after</p>', $html);
        $this->assertStringNotContainsString('confirm the spelling', $html);
        $this->assertStringNotContainsString('internal-note', $html);
    }

    #[Test]
    public function it_omits_an_internal_note_from_an_explicit_public_mode_too(): void
    {
        $doc = $this->doc(['type' => 'internalNote', 'content' => [$this->text('secret')]]);
        $this->assertSame('', ArticleBodyRenderer::render($doc, 'public'));
    }

    #[Test]
    public function it_renders_an_internal_note_in_preview_mode_with_the_rest_of_the_document_unchanged(): void
    {
        $doc = $this->doc(
            ['type' => 'paragraph', 'content' => [$this->text('before')]],
            ['type' => 'internalNote', 'content' => [$this->text('confirm the spelling before this runs')]],
            ['type' => 'paragraph', 'content' => [$this->text('after')]],
        );
        $this->assertSame(
            '<p>before</p><aside class="internal-note" data-internal-note="true">confirm the spelling before this runs</aside><p>after</p>',
            ArticleBodyRenderer::render($doc, 'preview'),
        );
    }

    #[Test]
    public function it_escapes_and_marks_internal_note_text_the_same_way_as_any_other_text(): void
    {
        $doc = $this->doc([
            'type' => 'internalNote',
            'content' => [$this->text('<b>'), $this->text('bold', [['type' => 'bold']])],
        ]);
        $this->assertSame(
            '<aside class="internal-note" data-internal-note="true">&lt;b&gt;<strong>bold</strong></aside>',
            ArticleBodyRenderer::render($doc, 'preview'),
        );
    }

    #[Test]
    public function it_never_leaks_internal_note_text_into_a_surrounding_block_in_either_mode(): void
    {
        $doc = $this->doc([
            'type' => 'blockquote',
            'content' => [['type' => 'internalNote', 'content' => [$this->text('secret')]]],
        ]);
        $this->assertSame('<blockquote></blockquote>', ArticleBodyRenderer::render($doc));
        $this->assertSame(
            '<blockquote><aside class="internal-note" data-internal-note="true">secret</aside></blockquote>',
            ArticleBodyRenderer::render($doc, 'preview'),
        );
    }

    #[Test]
    public function it_omits_an_unrecognized_node_type_entirely(): void
    {
        $doc = $this->doc(
            ['type' => 'paragraph', 'content' => [$this->text('before')]],
            ['type' => 'script', 'content' => [$this->text('alert(1)')]],
            ['type' => 'paragraph', 'content' => [$this->text('after')]],
        );
        $html = ArticleBodyRenderer::render($doc);
        $this->assertSame('<p>before</p><p>after</p>', $html);
        $this->assertStringNotContainsString('script', $html);
        $this->assertStringNotContainsString('alert', $html);
    }

    #[Test]
    public function it_drops_a_javascript_link_href_rather_than_passing_it_through(): void
    {
        $doc = $this->doc([
            'type' => 'paragraph',
            'content' => [$this->text('click', [['type' => 'link', 'attrs' => ['href' => 'javascript:alert(1)']]])],
        ]);
        $this->assertSame('<p>click</p>', ArticleBodyRenderer::render($doc));
    }

    #[Test]
    public function it_drops_an_unrecognized_mark_type(): void
    {
        $doc = $this->doc(['type' => 'paragraph', 'content' => [$this->text('x', [['type' => 'superscript']])]]);
        $this->assertSame('<p>x</p>', ArticleBodyRenderer::render($doc));
    }

    #[Test]
    public function it_ignores_a_heading_level_outside_1_to_3(): void
    {
        $doc = $this->doc(['type' => 'heading', 'attrs' => ['level' => 6], 'content' => [$this->text('x')]]);
        $this->assertSame('<p>x</p>', ArticleBodyRenderer::render($doc));
    }

    #[Test]
    public function it_escapes_raw_html_characters_in_text_content(): void
    {
        $doc = $this->doc(['type' => 'paragraph', 'content' => [$this->text('<img src=x onerror=alert(1)>')]]);
        $this->assertSame('<p>&lt;img src=x onerror=alert(1)&gt;</p>', ArticleBodyRenderer::render($doc));
    }

    #[Test]
    public function it_renders_an_empty_body_for_non_array_input_rather_than_throwing(): void
    {
        $this->assertSame('', ArticleBodyRenderer::render(null));
        $this->assertSame('', ArticleBodyRenderer::render('not json'));
        $this->assertSame('', ArticleBodyRenderer::render(42));
    }
}
