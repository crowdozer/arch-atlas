/**
 * Browser JSON download helper (local-first blob + temporary object URL).
 * No server; revoke URL after click.
 */

/** Trigger a file download of pretty-printed JSON. */
export function downloadJson(filename: string, value: unknown): void {
	const json = `${JSON.stringify(value, null, 2)}\n`;
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	try {
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.rel = 'noopener';
		// Firefox needs the node in the tree for click-to-download
		document.body.appendChild(a);
		a.click();
		a.remove();
	} finally {
		URL.revokeObjectURL(url);
	}
}
