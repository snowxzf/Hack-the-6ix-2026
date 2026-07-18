import React from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { App } from "./App";
import { AUTH0_AUDIENCE, AUTH0_CLIENT_ID, AUTH0_CONFIGURED, AUTH0_DOMAIN } from "./lib/auth0Config";
import "./styles.css";

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
        redirect_uri: window.location.origin,
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
