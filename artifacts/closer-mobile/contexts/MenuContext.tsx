import React, { createContext, useCallback, useContext, useState } from 'react';

interface MenuContextValue {
  isOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
}

const MenuContext = createContext<MenuContextValue>({
  isOpen: false,
  openMenu: () => {},
  closeMenu: () => {},
});

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openMenu = useCallback(() => setIsOpen(true), []);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  return (
    <MenuContext.Provider value={{ isOpen, openMenu, closeMenu }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  return useContext(MenuContext);
}
