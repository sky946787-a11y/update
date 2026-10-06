'use strict';

import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSession } from './useSession.js';
import { getActorHome, LOGIN_PATH } from './actorHome.js';
import { toast } from '../components/feedback/feedback.js';

const REDIRECT_DELAY_MS = 1100;


export default function RequireModule({ module: moduleName, children }) {
  const { isAuthenticated, actor, hasModuleAccess } = useSession();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);
  const firedRef = useRef(false);

  const allowed = isAuthenticated && hasModuleAccess(moduleName);

  useEffect(() => {
    // FIX: Reset denied back to false whenever the user IS authenticated and
    // IS allowed. Without this reset, if denied ever became true (e.g. during
    // a brief navigation transition in React Router or a StrictMode re-run),
    // RequireModule would permanently return null for the current session —
    // making the page look blank until the user manually refreshed the browser.
    if (isAuthenticated && allowed) {
      if (denied) setDenied(false);
      return undefined;
    }

    if (!isAuthenticated) return undefined;

    // User is authenticated but not allowed for this module.
    setDenied(true);

    if (!firedRef.current) {
      firedRef.current = true;
      toast('Access denied — ' + actor + ' cannot open the ' + moduleName + ' module.', 'error');
    }
    const t = setTimeout(() => navigate(getActorHome(actor), { replace: true }), REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [isAuthenticated, allowed, denied, actor, moduleName, navigate]);

  if (!isAuthenticated) return <Navigate to={LOGIN_PATH} replace />;
  if (denied || !allowed) return null;
  return children;
}

/** Platform Super User console has its own auth realm, separate from the actor system. */
export function RequirePlatformUser({ children }) {
  const { isPlatformUser } = useSession();
  if (!isPlatformUser) return <Navigate to="/platform/platform-login.html" replace />;
  return children;
}
