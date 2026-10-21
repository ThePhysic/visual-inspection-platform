import { createContext } from 'react';

export const DraftNavigationContext = createContext<((dirty: boolean) => void) | undefined>(undefined);
