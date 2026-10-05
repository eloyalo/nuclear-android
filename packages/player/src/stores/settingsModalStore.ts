import { create } from 'zustand';

export type PluginsTab = 'installed' | 'store';

type SettingsModalState = {
  isOpen: boolean;
  activeItemId: string | null;
  // Phone-width only: the nav sections are a drawer inside the panel. It lives
  // here rather than inside SettingsPanel so the Android back button can close
  // it before the panel itself.
  isNavOpen: boolean;
  pluginsTab: PluginsTab;
  open: (itemId?: string) => void;
  openPluginStore: () => void;
  close: () => void;
  selectItem: (itemId: string) => void;
  setNavOpen: (isNavOpen: boolean) => void;
  selectPluginsTab: (tab: PluginsTab) => void;
};

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  isOpen: false,
  activeItemId: null,
  isNavOpen: false,
  pluginsTab: 'installed',
  open: (itemId) =>
    set((state) => ({
      isOpen: true,
      isNavOpen: false,
      activeItemId: itemId ?? state.activeItemId,
    })),
  openPluginStore: () =>
    set({
      isOpen: true,
      isNavOpen: false,
      activeItemId: 'app-plugins',
      pluginsTab: 'store',
    }),
  close: () => set({ isOpen: false, isNavOpen: false }),
  selectItem: (itemId) => set({ activeItemId: itemId }),
  setNavOpen: (isNavOpen) => set({ isNavOpen }),
  selectPluginsTab: (pluginsTab) => set({ pluginsTab }),
}));
