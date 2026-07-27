/**
 * Shared DOM chrome helpers for the web host (no chart/nav ownership).
 */

export function $(id: string): HTMLElement | null {
	return document.getElementById(id);
}

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function setStatus(msg: string): void {
	const workspaceStatus = $('atlas-status');
	const uploadStatus = $('atlas-upload-status');
	if (workspaceStatus) workspaceStatus.textContent = msg;
	if (uploadStatus && !$('atlas-upload')?.classList.contains('hidden')) {
		uploadStatus.textContent = msg;
	}
}

export function showWarnings(warnings: string[]): void {
	const host = $('atlas-warnings');
	if (!host) return;
	host.innerHTML = '';
	for (const w of warnings) {
		const n = document.createElement('cds-inline-notification');
		n.setAttribute('kind', 'warning');
		n.setAttribute('title', 'Warning');
		n.setAttribute('subtitle', w);
		n.setAttribute('low-contrast', '');
		n.setAttribute('hide-close-button', '');
		n.classList.add('atlas-warning-notification');
		host.appendChild(n);
	}
}
