export const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
export const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;
export const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;

/** True once a tenant + SPA client id are set — gates whether <Auth0Provider> mounts at all. */
export const AUTH0_CONFIGURED = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);
