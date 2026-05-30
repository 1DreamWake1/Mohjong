import { useEffect, useState } from "react";

export function useCurrentPath(): string {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    function handleLocationChange(): void {
      setCurrentPath(window.location.pathname);
    }

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  return currentPath;
}
