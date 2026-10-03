import { PanelLeft, PanelRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { FC, ReactNode, useRef } from 'react';

import { cn } from '../../utils';
import { Button } from '../Button';
import { SIDEBAR_ANIMATIONS, SIDEBAR_CONFIG } from './constants';
import { useSidebarResize } from './hooks';
import { useWorkspaceIsCompact } from './PlayerWorkspaceContext';

export type PlayerWorkspaceSidebarPropsBase = {
  children?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  persistentFooter?: ReactNode;
  isCollapsed: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onToggle: () => void;
  className?: string;
};

type PlayerWorkspaceSidebarProps = PlayerWorkspaceSidebarPropsBase & {
  side: 'left' | 'right';
};

export const PlayerWorkspaceSidebar: FC<PlayerWorkspaceSidebarProps> = ({
  children,
  headerActions,
  footer,
  persistentFooter,
  isCollapsed,
  width,
  onWidthChange,
  onToggle,
  side,
  className = '',
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isCompact = useWorkspaceIsCompact();
  const { handleMouseDown, isResizingState } = useSidebarResize(
    width,
    onWidthChange,
    side,
    isCollapsed,
  );

  const currentWidth = isCollapsed ? SIDEBAR_CONFIG.COLLAPSED_WIDTH : width;
  // In drawer mode the sidebar is fully open or fully off-screen; there is no
  // collapsed-but-visible rail and no room for icon-only labels.
  const isContentCollapsed = isCompact ? false : isCollapsed;

  const header = (
    <span
      className={cn('mb-4 flex flex-row items-center', {
        'justify-end': side === 'left',
        'justify-start': side === 'right',
        'px-2 pt-2': !isContentCollapsed,
      })}
    >
      <Button
        data-testid={`sidebar-toggle-${side}`}
        className={cn('top-2 px-2', {
          'right-1': side === 'left',
          'left-1': side === 'right',
          'mx-1 mt-2': side === 'right' && isContentCollapsed,
        })}
        size="icon"
        onClick={onToggle}
      >
        {side === 'left' ? <PanelLeft /> : <PanelRight />}
      </Button>
      {!isContentCollapsed && headerActions && (
        <span className="flex flex-1 items-center justify-end gap-1">
          {headerActions}
        </span>
      )}
    </span>
  );

  const body = (
    <>
      <div
        className={cn('flex flex-1 flex-col overflow-hidden', {
          'px-2 pb-2': !isContentCollapsed,
        })}
      >
        {children}
      </div>

      {!isContentCollapsed && footer}

      {persistentFooter && (
        <div className="mt-auto flex flex-col items-center gap-2 py-2">
          {persistentFooter}
        </div>
      )}
    </>
  );

  if (isCompact) {
    return (
      <>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              key={`sidebar-backdrop-${side}`}
              data-testid={`sidebar-backdrop-${side}`}
              // z-[35], not the more common z-30: third-party plugin panels
              // (e.g. nuclear-mini-player) render arbitrary DOM outside this
              // app's own stacking scale, and this needs to sit above the
              // ones that don't set their own extreme z-index.
              className="absolute inset-0 z-[35] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
            />
          )}
        </AnimatePresence>
        <motion.div
          ref={sidebarRef}
          data-testid={`sidebar-drawer-${side}`}
          aria-hidden={isCollapsed}
          className={cn(
            'border-border absolute inset-y-0 z-[45] flex w-[min(85vw,20rem)] flex-col overflow-hidden',
            {
              'surface-sidebar-left left-0 border-r-(length:--border-width)':
                side === 'left',
              'surface-sidebar-right right-0 border-l-(length:--border-width)':
                side === 'right',
              'pointer-events-none': isCollapsed,
            },
            className,
          )}
          animate={{
            x: isCollapsed ? (side === 'left' ? '-100%' : '100%') : '0%',
          }}
          transition={SIDEBAR_ANIMATIONS.width.spring}
        >
          {header}
          {body}
        </motion.div>
      </>
    );
  }

  return (
    <motion.div
      ref={sidebarRef}
      data-testid={`sidebar-${side}`}
      className={cn(
        'border-border relative flex flex-col overflow-hidden',
        {
          'surface-sidebar-left border-r-(length:--border-width)':
            side === 'left',
          'surface-sidebar-right border-l-(length:--border-width)':
            side === 'right',
        },
        className,
      )}
      animate={{ width: currentWidth }}
      transition={
        isResizingState
          ? { duration: 0 }
          : {
              type: 'spring',
              stiffness: 300,
              damping: 30,
              mass: 0.8,
            }
      }
    >
      {header}
      {body}

      {!isCollapsed && (
        <div
          className={cn(
            'absolute top-0 bottom-0 w-1 cursor-col-resize transition-colors',
            side === 'left' ? 'right-0' : 'left-0',
          )}
          onMouseDown={handleMouseDown}
        />
      )}
    </motion.div>
  );
};
