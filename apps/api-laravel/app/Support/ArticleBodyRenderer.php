<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Allowlist renderer for article bodies (Tiptap/ProseMirror JSON -> semantic HTML).
 *
 * Ported node-for-node from apps/api/src/lib/sanitizeHtml.ts so the two backends can never
 * render an article's body differently. Never parses untrusted HTML — it walks the ProseMirror
 * document tree and emits HTML itself, one string per allowlisted node/mark type. An
 * unrecognized node, mark, or attribute is simply never turned into a tag, rather than being
 * scrubbed out of markup after the fact.
 */
class ArticleBodyRenderer
{
    private const HEADING_TAGS = [1 => 'h1', 2 => 'h2', 3 => 'h3'];

    private const LANGUAGE_PATTERN = '/^[a-zA-Z0-9_+-]{1,32}$/';

    private const ALIGN_VALUES = ['left', 'center', 'right'];

    /** Renders sanitized, semantic HTML from a Tiptap/ProseMirror document. Never throws on
     *  malformed input — a body that fails to parse as a document renders as an empty body. */
    public static function render(mixed $bodyJson): string
    {
        if (! is_array($bodyJson)) {
            return '';
        }

        return self::renderNode($bodyJson);
    }

    private static function escapeHtml(string $value): string
    {
        return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $value);
    }

    private static function escapeAttr(string $value): string
    {
        return str_replace('"', '&quot;', self::escapeHtml($value));
    }

    /** Accepts only http(s) absolute URLs or root-relative paths. Rejects `javascript:`, `data:`,
     *  and every other scheme that could execute in the reader's browser. */
    private static function sanitizeUrl(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }
        if (str_starts_with($value, '/') && ! str_starts_with($value, '//')) {
            return $value;
        }
        $parts = parse_url($value);
        if ($parts === false || ! isset($parts['scheme']) || ! in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            return null;
        }

        return $value;
    }

    private static function sanitizePositiveInt(mixed $value, int $max): ?int
    {
        if (! is_int($value) || $value < 1 || $value > $max) {
            return null;
        }

        return $value;
    }

    /** @return array<int, array<string, mixed>> */
    private static function nodeArray(mixed $content): array
    {
        if (! is_array($content)) {
            return [];
        }

        return array_values(array_filter($content, fn ($n) => is_array($n)));
    }

    /** @return array<int, array<string, mixed>> */
    private static function markArray(mixed $marks): array
    {
        if (! is_array($marks)) {
            return [];
        }

        return array_values(array_filter($marks, fn ($m) => is_array($m)));
    }

    /** Wraps already-escaped text in every allowlisted mark it carries. Unknown marks are dropped.
     *  @param array<int, array<string, mixed>> $marks */
    private static function renderMarks(string $innerHtml, array $marks): string
    {
        foreach ($marks as $mark) {
            $innerHtml = match ($mark['type'] ?? null) {
                'bold' => "<strong>{$innerHtml}</strong>",
                'italic' => "<em>{$innerHtml}</em>",
                'underline' => "<u>{$innerHtml}</u>",
                'strike' => "<s>{$innerHtml}</s>",
                'link' => self::renderLink($innerHtml, $mark),
                default => $innerHtml,
            };
        }

        return $innerHtml;
    }

    /** @param array<string, mixed> $mark */
    private static function renderLink(string $innerHtml, array $mark): string
    {
        $href = self::sanitizeUrl($mark['attrs']['href'] ?? null);
        if ($href === null) {
            return $innerHtml;
        }

        return '<a href="'.self::escapeAttr($href).'" rel="noopener noreferrer nofollow" target="_blank">'.$innerHtml.'</a>';
    }

    /** @param array<string, mixed> $node */
    private static function renderText(array $node): string
    {
        $text = $node['text'] ?? null;
        if (! is_string($text) || $text === '') {
            return '';
        }

        return self::renderMarks(self::escapeHtml($text), self::markArray($node['marks'] ?? null));
    }

    /** Code block content is rendered as plain escaped text — marks never apply inside code.
     *  @param array<int, array<string, mixed>> $nodes */
    private static function renderCodeText(array $nodes): string
    {
        return implode('', array_map(
            fn (array $n) => ($n['type'] ?? null) === 'text' && is_string($n['text'] ?? null) ? self::escapeHtml($n['text']) : '',
            $nodes,
        ));
    }

    /** @param array<string, mixed> $node */
    private static function renderChildren(array $node): string
    {
        return implode('', array_map(self::renderNode(...), self::nodeArray($node['content'] ?? null)));
    }

    /** @param array<string, mixed> $node */
    private static function renderImage(array $node): string
    {
        $attrs = $node['attrs'] ?? [];
        $src = self::sanitizeUrl($attrs['src'] ?? null);
        if ($src === null) {
            return '';
        }
        $alt = is_string($attrs['alt'] ?? null) ? self::escapeAttr($attrs['alt']) : '';
        $width = self::sanitizePositiveInt($attrs['width'] ?? null, 4000);
        $align = is_string($attrs['align'] ?? null) && in_array($attrs['align'], self::ALIGN_VALUES, true) ? $attrs['align'] : 'center';
        $caption = is_string($attrs['caption'] ?? null) && $attrs['caption'] !== '' ? $attrs['caption'] : null;

        $widthAttr = $width !== null ? " width=\"{$width}\"" : '';
        $img = '<img src="'.self::escapeAttr($src)."\" alt=\"{$alt}\"{$widthAttr}>";
        $figcaption = $caption !== null ? '<figcaption>'.self::escapeHtml($caption).'</figcaption>' : '';

        return "<figure class=\"align-{$align}\">{$img}{$figcaption}</figure>";
    }

    /** Video is rendered as a plain link, never an `<iframe>` — embedding an arbitrary
     *  third-party URL in a frame is exactly what this allowlist exists to prevent.
     *
     *  @param array<string, mixed> $node */
    private static function renderVideo(array $node): string
    {
        $src = self::sanitizeUrl($node['attrs']['src'] ?? null);
        if ($src === null) {
            return '';
        }

        return '<figure class="video-embed"><a href="'.self::escapeAttr($src).'" rel="noopener noreferrer nofollow" target="_blank">'.self::escapeHtml($src).'</a></figure>';
    }

    /** @param array<string, mixed> $node */
    private static function renderTableCell(array $node, string $tag): string
    {
        $colspan = self::sanitizePositiveInt($node['attrs']['colspan'] ?? null, 1000);
        $rowspan = self::sanitizePositiveInt($node['attrs']['rowspan'] ?? null, 1000);
        $colspanAttr = $colspan !== null && $colspan > 1 ? " colspan=\"{$colspan}\"" : '';
        $rowspanAttr = $rowspan !== null && $rowspan > 1 ? " rowspan=\"{$rowspan}\"" : '';

        return "<{$tag}{$colspanAttr}{$rowspanAttr}>".self::renderChildren($node)."</{$tag}>";
    }

    /** @param array<string, mixed> $node */
    private static function renderNode(array $node): string
    {
        return match ($node['type'] ?? null) {
            'doc' => self::renderChildren($node),
            'text' => self::renderText($node),
            'paragraph' => '<p>'.self::renderChildren($node).'</p>',
            'heading' => self::renderHeading($node),
            'blockquote' => '<blockquote>'.self::renderChildren($node).'</blockquote>',
            'codeBlock' => self::renderCodeBlock($node),
            'bulletList' => '<ul>'.self::renderChildren($node).'</ul>',
            'orderedList' => self::renderOrderedList($node),
            'listItem' => '<li>'.self::renderChildren($node).'</li>',
            'taskList' => '<ul class="task-list">'.self::renderChildren($node).'</ul>',
            'taskItem' => self::renderTaskItem($node),
            'table' => '<table><tbody>'.self::renderChildren($node).'</tbody></table>',
            'tableRow' => '<tr>'.self::renderChildren($node).'</tr>',
            'tableCell' => self::renderTableCell($node, 'td'),
            'tableHeader' => self::renderTableCell($node, 'th'),
            'image' => self::renderImage($node),
            'horizontalRule' => '<hr>',
            'video' => self::renderVideo($node),
            // Unrecognized node type: omit it and its content entirely. There is no safe way to
            // infer semantics for a type this renderer was never taught.
            default => '',
        };
    }

    /** @param array<string, mixed> $node */
    private static function renderHeading(array $node): string
    {
        $level = self::sanitizePositiveInt($node['attrs']['level'] ?? null, 3);
        $tag = $level !== null ? (self::HEADING_TAGS[$level] ?? null) : null;
        if ($tag === null) {
            return '<p>'.self::renderChildren($node).'</p>';
        }

        return "<{$tag}>".self::renderChildren($node)."</{$tag}>";
    }

    /** @param array<string, mixed> $node */
    private static function renderCodeBlock(array $node): string
    {
        $language = $node['attrs']['language'] ?? null;
        $classAttr = is_string($language) && preg_match(self::LANGUAGE_PATTERN, $language) === 1
            ? ' class="language-'.self::escapeAttr($language).'"'
            : '';

        return "<pre><code{$classAttr}>".self::renderCodeText(self::nodeArray($node['content'] ?? null)).'</code></pre>';
    }

    /** @param array<string, mixed> $node */
    private static function renderOrderedList(array $node): string
    {
        $start = self::sanitizePositiveInt($node['attrs']['start'] ?? null, 100000);
        $startAttr = $start !== null && $start !== 1 ? " start=\"{$start}\"" : '';

        return "<ol{$startAttr}>".self::renderChildren($node).'</ol>';
    }

    /** @param array<string, mixed> $node */
    private static function renderTaskItem(array $node): string
    {
        $checked = ($node['attrs']['checked'] ?? null) === true;
        $checkedAttr = $checked ? ' checked' : '';
        $checkedStr = $checked ? 'true' : 'false';

        return "<li class=\"task-item\" data-checked=\"{$checkedStr}\"><input type=\"checkbox\" disabled{$checkedAttr}>".self::renderChildren($node).'</li>';
    }
}
