import { useEffect, useState } from "react";

import { ROUTE_CHANGE_EVENT } from "./routes.js";

export function useCurrentPath(): string {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    function handleLocationChange(): void {
      setCurrentPath(window.location.pathname);
    }

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener(ROUTE_CHANGE_EVENT, handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener(ROUTE_CHANGE_EVENT, handleLocationChange);
    };
  }, []);

  return currentPath;
}
