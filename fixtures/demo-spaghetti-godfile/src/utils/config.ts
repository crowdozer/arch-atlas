export const APP_NAME = 'SpaghettiMart';
export const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
export const FEATURE_FLAGS = {
	checkoutV2: true,
	legacyShim: true,
	godHubRouting: true,
};
