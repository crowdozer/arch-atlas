/**
 * Carbon Design System icons for the repository tree.
 * Maps path kind / extension → 16px CDS glyph (SVG string).
 */
import { toString } from '@carbon/icon-helpers';
import Application16 from '@carbon/icons/es/application/16.js';
import Asm16 from '@carbon/icons/es/ASM/16.js';
import C16 from '@carbon/icons/es/C/16.js';
import CPlusPlus16 from '@carbon/icons/es/CPlusPlus/16.js';
import Csv16 from '@carbon/icons/es/CSV/16.js';
import Document16 from '@carbon/icons/es/document/16.js';
import DocumentBlank16 from '@carbon/icons/es/document--blank/16.js';
import DocumentConfig16 from '@carbon/icons/es/document--configuration/16.js';
import Folder16 from '@carbon/icons/es/folder/16.js';
import FolderOpen16 from '@carbon/icons/es/folder--open/16.js';
import Html16 from '@carbon/icons/es/HTML/16.js';
import Java16 from '@carbon/icons/es/JAVA/16.js';
import Jpg16 from '@carbon/icons/es/JPG/16.js';
import Json16 from '@carbon/icons/es/JSON/16.js';
import Key16 from '@carbon/icons/es/KEY/16.js';
import Package16 from '@carbon/icons/es/package/16.js';
import Pdf16 from '@carbon/icons/es/PDF/16.js';
import Png16 from '@carbon/icons/es/PNG/16.js';
import RepoSource16 from '@carbon/icons/es/repo--source-code/16.js';
import Script16 from '@carbon/icons/es/script/16.js';
import Sql16 from '@carbon/icons/es/SQL/16.js';
import Svg16 from '@carbon/icons/es/SVG/16.js';
import Tsv16 from '@carbon/icons/es/TSV/16.js';
import Txt16 from '@carbon/icons/es/TXT/16.js';
import Xml16 from '@carbon/icons/es/XML/16.js';
import Zip16 from '@carbon/icons/es/ZIP/16.js';

/** Minimal descriptor shape emitted by @carbon/icons modules. */
type IconDescriptor = {
	elem?: string;
	attrs?: Record<string, string | number | undefined>;
	content?: IconDescriptor[];
	name?: string;
	size?: number;
};

function iconSvg(descriptor: IconDescriptor): string {
	return toString(descriptor as Parameters<typeof toString>[0]);
}

const FOLDER = iconSvg(Folder16 as IconDescriptor);
const FOLDER_OPEN = iconSvg(FolderOpen16 as IconDescriptor);
const DOCUMENT = iconSvg(Document16 as IconDescriptor);
const DOCUMENT_BLANK = iconSvg(DocumentBlank16 as IconDescriptor);
const DOCUMENT_CONFIG = iconSvg(DocumentConfig16 as IconDescriptor);
const SCRIPT = iconSvg(Script16 as IconDescriptor);
const REPO_SOURCE = iconSvg(RepoSource16 as IconDescriptor);
const PACKAGE = iconSvg(Package16 as IconDescriptor);
const APPLICATION = iconSvg(Application16 as IconDescriptor);
const JSON_ICON = iconSvg(Json16 as IconDescriptor);
const HTML_ICON = iconSvg(Html16 as IconDescriptor);
const XML_ICON = iconSvg(Xml16 as IconDescriptor);
const ZIP_ICON = iconSvg(Zip16 as IconDescriptor);
const TXT_ICON = iconSvg(Txt16 as IconDescriptor);
const CSV_ICON = iconSvg(Csv16 as IconDescriptor);
const TSV_ICON = iconSvg(Tsv16 as IconDescriptor);
const SQL_ICON = iconSvg(Sql16 as IconDescriptor);
const SVG_ICON = iconSvg(Svg16 as IconDescriptor);
const PNG_ICON = iconSvg(Png16 as IconDescriptor);
const JPG_ICON = iconSvg(Jpg16 as IconDescriptor);
const PDF_ICON = iconSvg(Pdf16 as IconDescriptor);
const JAVA_ICON = iconSvg(Java16 as IconDescriptor);
const C_ICON = iconSvg(C16 as IconDescriptor);
const CPP_ICON = iconSvg(CPlusPlus16 as IconDescriptor);
const ASM_ICON = iconSvg(Asm16 as IconDescriptor);
const KEY_ICON = iconSvg(Key16 as IconDescriptor);

/** Basename → fixed icons (config / package roots). */
const BASENAME_ICONS: Record<string, string> = {
	'package.json': PACKAGE,
	'package-lock.json': PACKAGE,
	'pnpm-lock.yaml': PACKAGE,
	'yarn.lock': PACKAGE,
	'tsconfig.json': DOCUMENT_CONFIG,
	'jsconfig.json': DOCUMENT_CONFIG,
	'astro.config.mjs': DOCUMENT_CONFIG,
	'astro.config.ts': DOCUMENT_CONFIG,
	'vite.config.ts': DOCUMENT_CONFIG,
	'vite.config.js': DOCUMENT_CONFIG,
	'vitest.config.ts': DOCUMENT_CONFIG,
	'.env': KEY_ICON,
	'.env.local': KEY_ICON,
	'.env.example': KEY_ICON,
	'dockerfile': APPLICATION,
	'makefile': SCRIPT,
};

/** Extension (lowercase, no dot) → icon. */
const EXT_ICONS: Record<string, string> = {
	ts: REPO_SOURCE,
	tsx: REPO_SOURCE,
	mts: REPO_SOURCE,
	cts: REPO_SOURCE,
	js: SCRIPT,
	jsx: SCRIPT,
	mjs: SCRIPT,
	cjs: SCRIPT,
	json: JSON_ICON,
	html: HTML_ICON,
	htm: HTML_ICON,
	xml: XML_ICON,
	svg: SVG_ICON,
	css: DOCUMENT,
	scss: DOCUMENT,
	sass: DOCUMENT,
	less: DOCUMENT,
	md: TXT_ICON,
	mdx: TXT_ICON,
	txt: TXT_ICON,
	csv: CSV_ICON,
	tsv: TSV_ICON,
	sql: SQL_ICON,
	zip: ZIP_ICON,
	png: PNG_ICON,
	jpg: JPG_ICON,
	jpeg: JPG_ICON,
	gif: PNG_ICON,
	webp: PNG_ICON,
	pdf: PDF_ICON,
	java: JAVA_ICON,
	c: C_ICON,
	h: C_ICON,
	cpp: CPP_ICON,
	cc: CPP_ICON,
	cxx: CPP_ICON,
	hpp: CPP_ICON,
	asm: ASM_ICON,
	s: ASM_ICON,
	yml: DOCUMENT_CONFIG,
	yaml: DOCUMENT_CONFIG,
	toml: DOCUMENT_CONFIG,
	ini: DOCUMENT_CONFIG,
	env: KEY_ICON,
	sh: SCRIPT,
	bash: SCRIPT,
	zsh: SCRIPT,
	py: SCRIPT,
	rb: SCRIPT,
	go: SCRIPT,
	rs: SCRIPT,
	php: SCRIPT,
	vue: SCRIPT,
	svelte: SCRIPT,
	astro: SCRIPT,
};

/**
 * SVG markup for a tree row icon (16×16, currentColor).
 */
export function treeIconSvg(
	kind: 'dir' | 'file',
	path: string,
	opts?: { open?: boolean },
): string {
	if (kind === 'dir') {
		return opts?.open ? FOLDER_OPEN : FOLDER;
	}

	const base = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
	const lower = base.toLowerCase();
	if (BASENAME_ICONS[lower]) return BASENAME_ICONS[lower];

	const dot = lower.lastIndexOf('.');
	if (dot > 0) {
		const ext = lower.slice(dot + 1);
		if (EXT_ICONS[ext]) return EXT_ICONS[ext];
	}

	return DOCUMENT_BLANK;
}
