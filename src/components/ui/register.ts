/**
 * @ui-carbon Selective Carbon Web Components registration.
 * Import once from Layout (client). Pages must not import this or cds-* tags.
 */
import '@carbon/web-components/es/components/button/index.js';
import '@carbon/web-components/es/components/tag/index.js';
import '@carbon/web-components/es/components/tile/tile.js';
import '@carbon/web-components/es/components/tile/clickable-tile.js';
import '@carbon/web-components/es/components/accordion/index.js';
import '@carbon/web-components/es/components/dropdown/index.js';
import '@carbon/web-components/es/components/content-switcher/index.js';
import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/ui-shell/header.js';
import '@carbon/web-components/es/components/ui-shell/header-name.js';
import '@carbon/web-components/es/components/ui-shell/header-nav.js';
import '@carbon/web-components/es/components/ui-shell/header-nav-item.js';
import '@carbon/web-components/es/components/skip-to-content/index.js';
import '@carbon/web-components/es/components/notification/inline-notification.js';
import '@carbon/web-components/es/components/search/index.js';
import '@carbon/web-components/es/components/checkbox/index.js';
import '@carbon/web-components/es/components/file-uploader/index.js';
import '@carbon/web-components/es/components/code-snippet/index.js';
import '@carbon/web-components/es/components/contained-list/index.js';

/* Side-effect imports above define all registered cds-* hosts. Drop the SSR
 * FOUC class so any belt-and-suspenders pending styles can release. */
document.documentElement.classList.remove('atlas-carbon-pending');
