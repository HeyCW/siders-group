import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml.js';

function text(value: string, marks: Array<Record<string, unknown>> = []) {
  return { type: 'text', text: value, marks };
}

function doc(...content: unknown[]) {
  return { type: 'doc', content };
}

describe('sanitizeHtml — one test per supported block type', () => {
  it('renders a paragraph', () => {
    expect(sanitizeHtml(doc({ type: 'paragraph', content: [text('hello')] })).html).toBe('<p>hello</p>');
  });

  it('renders headings H1-H3', () => {
    for (const level of [1, 2, 3]) {
      const { html } = sanitizeHtml(doc({ type: 'heading', attrs: { level }, content: [text('Title')] }));
      expect(html).toBe(`<h${level}>Title</h${level}>`);
    }
  });

  it('renders bold, italic, underline, and strikethrough marks', () => {
    expect(sanitizeHtml(doc({ type: 'paragraph', content: [text('b', [{ type: 'bold' }])] })).html).toBe(
      '<p><strong>b</strong></p>',
    );
    expect(sanitizeHtml(doc({ type: 'paragraph', content: [text('i', [{ type: 'italic' }])] })).html).toBe(
      '<p><em>i</em></p>',
    );
    expect(sanitizeHtml(doc({ type: 'paragraph', content: [text('u', [{ type: 'underline' }])] })).html).toBe(
      '<p><u>u</u></p>',
    );
    expect(sanitizeHtml(doc({ type: 'paragraph', content: [text('s', [{ type: 'strike' }])] })).html).toBe(
      '<p><s>s</s></p>',
    );
  });

  it('renders a link with a safe href', () => {
    const node = doc({
      type: 'paragraph',
      content: [text('click', [{ type: 'link', attrs: { href: 'https://siders.id/x' } }])],
    });
    expect(sanitizeHtml(node).html).toBe(
      '<p><a href="https://siders.id/x" rel="noopener noreferrer nofollow" target="_blank">click</a></p>',
    );
  });

  it('renders a block quote', () => {
    expect(sanitizeHtml(doc({ type: 'blockquote', content: [{ type: 'paragraph', content: [text('q')] }] })).html).toBe(
      '<blockquote><p>q</p></blockquote>',
    );
  });

  it('renders a code block with an allowlisted language class', () => {
    const node = doc({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const x = 1;' }],
    });
    expect(sanitizeHtml(node).html).toBe('<pre><code class="language-ts">const x = 1;</code></pre>');
  });

  it('renders an ordered list and an unordered list', () => {
    const bullet = doc({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('a')] }] }],
    });
    expect(sanitizeHtml(bullet).html).toBe('<ul><li><p>a</p></li></ul>');

    const ordered = doc({
      type: 'orderedList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('a')] }] }],
    });
    expect(sanitizeHtml(ordered).html).toBe('<ol><li><p>a</p></li></ol>');
  });

  it('renders a checklist with checked state', () => {
    const node = doc({
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [text('done')] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [text('todo')] }] },
      ],
    });
    const { html } = sanitizeHtml(node);
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('checked><p>done</p>');
    expect(html).toContain('data-checked="false"');
    expect(html).not.toContain('disabled checked><p>todo</p>');
  });

  it('renders a table', () => {
    const node = doc({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [text('H')] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [text('D')] }] },
          ],
        },
      ],
    });
    expect(sanitizeHtml(node).html).toBe(
      '<table><tbody><tr><th><p>H</p></th><td><p>D</p></td></tr></tbody></table>',
    );
  });

  it('renders an image with caption and alignment', () => {
    const node = doc({
      type: 'image',
      attrs: { src: '/media/2026/08/x.webp', alt: 'desc', width: 400, align: 'left', caption: 'A caption' },
    });
    const { html } = sanitizeHtml(node);
    expect(html).toBe(
      '<figure class="align-left"><img src="/media/2026/08/x.webp" alt="desc" width="400"><figcaption>A caption</figcaption></figure>',
    );
  });

  it('renders a horizontal divider', () => {
    expect(sanitizeHtml(doc({ type: 'horizontalRule' })).html).toBe('<hr>');
  });

  it('renders a video embed as an inert link, never an iframe', () => {
    const node = doc({ type: 'video', attrs: { src: 'https://youtube.com/watch?v=abc' } });
    const { html } = sanitizeHtml(node);
    expect(html).toContain('<a href="https://youtube.com/watch?v=abc"');
    expect(html).not.toContain('<iframe');
  });
});

describe('sanitizeHtml — disallowed markup is stripped', () => {
  it('omits an unrecognized node type entirely', () => {
    const node = doc(
      { type: 'paragraph', content: [text('before')] },
      { type: 'script', content: [text('alert(1)')] },
      { type: 'paragraph', content: [text('after')] },
    );
    const { html } = sanitizeHtml(node);
    expect(html).toBe('<p>before</p><p>after</p>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('alert');
  });

  it('drops a javascript: link href rather than passing it through', () => {
    const node = doc({
      type: 'paragraph',
      content: [text('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])],
    });
    expect(sanitizeHtml(node).html).toBe('<p>click</p>');
  });

  it('drops an unrecognized mark type', () => {
    const node = doc({ type: 'paragraph', content: [text('x', [{ type: 'superscript' }])] });
    expect(sanitizeHtml(node).html).toBe('<p>x</p>');
  });

  it('ignores a heading level outside 1-3', () => {
    const node = doc({ type: 'heading', attrs: { level: 6 }, content: [text('x')] });
    expect(sanitizeHtml(node).html).toBe('<p>x</p>');
  });

  it('escapes raw HTML characters in text content instead of passing them through', () => {
    const node = doc({ type: 'paragraph', content: [text('<img src=x onerror=alert(1)>')] });
    const { html } = sanitizeHtml(node);
    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });
});

describe('sanitizeHtml — malformed input', () => {
  it('renders an empty body for non-object input rather than throwing', () => {
    expect(sanitizeHtml(null).html).toBe('');
    expect(sanitizeHtml(undefined).html).toBe('');
    expect(sanitizeHtml('not json').html).toBe('');
  });
});
