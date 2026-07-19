import React from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { App } from "./App";
import { AUTH0_AUDIENCE, AUTH0_CLIENT_ID, AUTH0_CONFIGURED, AUTH0_DOMAIN } from "./lib/auth0Config";
import "./styles.css";

/** Auth0 allow-lists treat localhost and 127.0.0.1 as different hosts.
 *  Vite often binds 127.0.0.1 while Application Settings use localhost — normalize. */
function auth0RedirectUri(): string {
  const { protocol, hostname, port } = window.location;
  const host = hostname === "127.0.0.1" ? "localhost" : hostname;
  const portPart = port ? `:${port}` : "";
  return `${protocol}//${host}${portPart}`;
}

const root = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

createRoot(document.getElementById("root")!).render(
  AUTH0_CONFIGURED ? (
    <Auth0Provider
      domain={AUTH0_DOMAIN!}
      clientId={AUTH0_CLIENT_ID!}
      authorizationParams={{
        redirect_uri: auth0RedirectUri(),
        scope: "openid profile email",
        ...(AUTH0_AUDIENCE ? { audience: AUTH0_AUDIENCE } : {}),
      }}
      cacheLocation="localstorage"
    >
      {root}
    </Auth0Provider>
  ) : (
    root
  ),
);
