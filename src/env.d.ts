/// <reference types="astro/client" />

interface ImportMetaEnv {
	/** Optional GA4 measurement ID (e.g. G-XXXXXXXXXX). Off when unset or in DEV. */
	readonly GOOGLE_ANALYTICS_ID?: string;
	/** Set automatically on Vercel: production | preview | development */
	readonly VERCEL_ENV?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
