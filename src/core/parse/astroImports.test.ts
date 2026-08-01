import { describe, expect, it } from 'vitest';
import {
	extractAstroImports,
	extractAstroScriptIslands,
} from '@core/parse/astroImports.ts';
import { buildGraph } from '@core/graph/build.ts';
import { classifyFileParse } from '@core/parse/capability.ts';
import { familyForPath } from '@core/parse/resolveRules.ts';
import { resolveSpecifier } from '@core/parse/resolve.ts';

describe('extractAstroScriptIslands', () => {
	it('extracts frontmatter between --- fences', () => {
		const src = `---
import Layout from '../layouts/Layout.astro';
import Button from '../components/ui/Button.astro';
---
<html></html>
`;
		const islands = extractAstroScriptIslands(src);
		expect(islands.length).toBeGreaterThanOrEqual(1);
		expect(islands[0]!.text).toContain('Layout.astro');
		expect(islands[0]!.lineOffset).toBe(1);
	});

	it('extracts inline script bodies and skips src= scripts', () => {
		const src = `---
const x = 1;
---
<script src="/external.js"></script>
<script lang="ts">
import { foo } from './foo';
</script>
`;
		const islands = extractAstroScriptIslands(src);
		const joined = islands.map((i) => i.text).join('\n');
		expect(joined).toContain("from './foo'");
		expect(joined).not.toContain('external.js');
	});
});

describe('extractAstroImports', () => {
	it('finds frontmatter imports with file-relative line numbers', () => {
		const src = `---
import A from './a.ts';
import B from './b.ts';
---
<p>hi</p>
`;
		const imps = extractAstroImports(src);
		expect(imps.map((i) => i.specifier).sort()).toEqual(['./a.ts', './b.ts']);
		// first import is line 2 of the file (after opening ---)
		const a = imps.find((i) => i.specifier === './a.ts');
		expect(a?.line).toBe(2);
	});
});

/**
 * L1 false-positive guards - template HTML must not become import edges;
 * frontmatter + inline <script> real imports must (positives + negatives same source).
 */
describe('L1 false-positive guards', () => {
	it('does not extract import-looking HTML/template body text', () => {
		const src = `---
import Layout from '../layouts/Layout.astro';
---
<html>
  <p>Docs: import { x } from './fake'</p>
  <code>import Button from './Button.astro'</code>
  <pre>
import { ghost } from '../ghost.ts';
  </pre>
</html>
`;
		const imps = extractAstroImports(src);
		const specs = imps.map((i) => i.specifier);
		expect(specs).toEqual(['../layouts/Layout.astro']);
		expect(specs).not.toContain('./fake');
		expect(specs).not.toContain('./Button.astro');
		expect(specs).not.toContain('../ghost.ts');
	});

	it('keeps frontmatter and inline script imports; skips src= external scripts', () => {
		const src = `---
import Layout from '../layouts/Layout.astro';
---
<script src="/cdn/widget.js"></script>
<script lang="ts">
import { greet } from '../lib/greet.ts';
</script>
<p>import { noise } from './html-noise'</p>
`;
		const imps = extractAstroImports(src);
		const specs = imps.map((i) => i.specifier).sort();
		expect(specs).toEqual(['../layouts/Layout.astro', '../lib/greet.ts'].sort());
		expect(specs).not.toContain('/cdn/widget.js');
		expect(specs).not.toContain('./html-noise');
	});
});

describe('astro graph integration', () => {
	it('classifies and resolves .astro → .astro / .ts edges', () => {
		expect(classifyFileParse('src/pages/index.astro').kind).toBe('astro-import');
		expect(familyForPath('src/pages/index.astro')).toBe('js-ts');

		const graph = buildGraph([
			{
				path: 'src/pages/index.astro',
				content: `---
import Layout from '../layouts/Layout.astro';
import { greet } from '../lib/greet.ts';
---
<Layout>{greet()}</Layout>
`,
				byteLength: 120,
			},
			{
				path: 'src/layouts/Layout.astro',
				content: `---
const title = 'x';
---
<slot />
`,
				byteLength: 40,
			},
			{
				path: 'src/lib/greet.ts',
				content: `export function greet() { return 'hi'; }\n`,
				byteLength: 40,
			},
		]);

		expect(graph.files.get('src/pages/index.astro')?.isSource).toBe(true);
		expect(graph.files.get('src/pages/index.astro')?.parseKind).toBe('astro-import');
		const fromPage = graph.edges.filter((e) => e.from === 'src/pages/index.astro');
		expect(fromPage.some((e) => e.to === 'src/layouts/Layout.astro')).toBe(true);
		expect(fromPage.some((e) => e.to === 'src/lib/greet.ts')).toBe(true);
	});

	it('resolve probes .astro extension from js-ts family', () => {
		const files = new Set(['src/components/ui/Button.astro', 'src/pages/index.astro']);
		const hit = resolveSpecifier(
			'src/pages/index.astro',
			'../components/ui/Button',
			files,
			null,
		);
		expect(hit).toEqual({ kind: 'file', path: 'src/components/ui/Button.astro' });
	});
});
