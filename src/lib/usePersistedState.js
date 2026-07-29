import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage';

export function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() => readStorage(key, initialValue));

  useEffect(() => {
    writeStorage(key, value);
  }, [key, value]);

  return [value, setValue];
}
