/**
 * L1 adversarial — string/comment lookalikes must not become edges;
 * real relative import must.
 */
// Product FP class: form union painted as package '|'
form: 'import' | 'export' | 'require' | 'dynamic';
const doc = `import { fake } from './fake'`;
// import { no } from './commented';
/* import { no2 } from './block'; */

import { util } from './lib/util';

export function adversarial() {
	return util('adversarial');
}
