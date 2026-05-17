import { useEffect, useRef, useState } from 'react';

export const useKeyboardState = () => {
  const keysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return keysRef;
};

export const useLoadingProgress = (initialValue = 0) => {
  const [loadingProgress, setLoadingProgress] = useState(initialValue);
  const updateProgress = (loaded: number, total: number) => {
    setLoadingProgress(Math.floor((loaded / total) * 100));
  };

  return { loadingProgress, updateProgress };
};
