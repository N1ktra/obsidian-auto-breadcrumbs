import { App, FileView, Keymap, Menu, Platform, setIcon, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import {
  AutoBreadcrumbsSettings,
  BookmarkItemRef,
  FolderHierarchyItem,
} from './types';
import { BreadcrumbResolver } from './resolver';

interface DesktopLeafData {
  file: TFile;
  hierarchy: FolderHierarchyItem[];
  hierarchyEl: HTMLElement;
  trailingSeparatorEl?: HTMLElement;
  currentLevel: number;
  lastWidth: number;
}

type HierarchyDisplayEntry =
  | { type: 'item'; item: FolderHierarchyItem }
  | { type: 'ellipsis'; collapsed: FolderHierarchyItem[] };

export class BreadcrumbRenderer {
  private resizeObserver: ResizeObserver;
  private desktopLeafMap = new Map<HTMLElement, DesktopLeafData>();

  constructor(
    private app: App,
    private resolver: BreadcrumbResolver,
    private getSettings: () => AutoBreadcrumbsSettings
  ) {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target instanceof HTMLElement) {
          const width = Math.round(entry.contentRect.width);
          const data = this.desktopLeafMap.get(entry.target);
          if (data && Math.abs(data.lastWidth - width) >= 4) {
            this.adjustBreadcrumbCollapse(entry.target);
          }
        }
      }
    });
  }

  removeAll() {
    this.resizeObserver.disconnect();
    this.desktopLeafMap.clear();
    document.querySelectorAll('.auto-bc-header').forEach((el) => el.remove());
  }

  removeFromContainer(container: HTMLElement) {
    const titleContainer = container.querySelector<HTMLElement>(
      '.view-header-title-container'
    );
    if (titleContainer) {
      this.resizeObserver.unobserve(titleContainer);
      this.desktopLeafMap.delete(titleContainer);
    }
    container.querySelectorAll('.auto-bc-header').forEach((el) => el.remove());
  }

  private hideNativeBreadcrumbs(containerEl: HTMLElement) {
    containerEl
      .querySelectorAll<HTMLElement>(
        '.view-header-title-parent, .view-header-breadcrumb, .view-header-breadcrumb-separator'
      )
      .forEach((el) => {
        el.style.display = 'none';
      });
  }

  restoreNativeBreadcrumbs() {
    document
      .querySelectorAll<HTMLElement>(
        '.view-header-title-parent, .view-header-breadcrumb, .view-header-breadcrumb-separator'
      )
      .forEach((el) => {
        el.style.display = '';
      });
  }

  isMainAreaLeaf(leaf: WorkspaceLeaf): boolean {
    if (!leaf) return false;
    const root = leaf.getRoot();
    if (
      root === this.app.workspace.leftSplit ||
      root === this.app.workspace.rightSplit
    ) {
      return false;
    }

    const container = leaf.view?.containerEl;
    if (
      container &&
      container.closest(
        '.mod-left-split, .mod-right-split, .workspace-drawer, .mod-sidedock'
      )
    ) {
      return false;
    }

    return true;
  }

  updateActiveLeaf(force = false) {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (leaf) {
      this.updateLeaf(leaf, force);
    }
  }

  updateAllLeaves(force = false) {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (this.isMainAreaLeaf(leaf)) {
        this.updateLeaf(leaf, force);
      }
    });
  }

  updateLeaf(leaf: WorkspaceLeaf, force = false) {
    if (!leaf || !this.isMainAreaLeaf(leaf)) {
      return;
    }

    const view = leaf.view;
    if (!view) return;

    // Nur FileViews mit Datei oder der New-Tab ('empty')
    const isFileView = view instanceof FileView && !!view.file;
    const isEmptyView = view.getViewType() === 'empty';

    if (!isFileView && !isEmptyView) {
      return;
    }

    const file = isFileView ? view.file : null;
    this.render(file, view.containerEl, force);
  }

  render(file: TFile | null, containerEl?: HTMLElement, force = false) {
    const targetRoot =
      containerEl ?? this.app.workspace.getMostRecentLeaf()?.view?.containerEl;

    if (!targetRoot) return;

    // 3. Universeller Containerschild gegen Drawers und Sidedocks
    if (
      targetRoot.closest(
        '.mod-left-split, .mod-right-split, .workspace-drawer, .mod-sidedock'
      )
    ) {
      return;
    }

    // Native Ordner-Breadcrumbs in der oberen Leiste immer ausblenden
    this.hideNativeBreadcrumbs(targetRoot);

    // 4. Idempotenz-Schutz: Verhindert unnötige DOM-Mutationen
    const currentPath = file ? file.path : '__empty__';
    const existingBar = targetRoot.querySelector<HTMLElement>('.auto-bc-header');
    if (!force && existingBar && existingBar.dataset.renderedPath === currentPath) {
      return;
    }

    this.removeFromContainer(targetRoot);

    const settings = this.getSettings();
    const showBookmarksSetting = settings.showBookmarks;

    const bookmarkedFiles: BookmarkItemRef[] = showBookmarksSetting
      ? this.resolver.getBookmarkedFiles()
      : [];

    if (Platform.isPhone) {
      const hierarchy: FolderHierarchyItem[] = file
        ? this.resolver.getFolderHierarchy(file, true)
        : [];

      const clickableAncestors = hierarchy.filter(
        (item): item is FolderHierarchyItem & { matchedFile: TFile } =>
          item.matchedFile !== null
      );
      const targetParentItem =
        clickableAncestors.length > 0
          ? clickableAncestors[clickableAncestors.length - 1]
          : null;

      if (!showBookmarksSetting && !targetParentItem) {
        return;
      }

      this.renderMobile(targetRoot, file, bookmarkedFiles, hierarchy, targetParentItem, currentPath);
    } else {
      const hierarchy: FolderHierarchyItem[] = file
        ? this.resolver.getFolderHierarchy(file)
        : [];

      const hasHierarchy = hierarchy.length > 0;

      if (!showBookmarksSetting && !hasHierarchy) {
        return;
      }

      this.renderDesktop(targetRoot, file, bookmarkedFiles, hierarchy, currentPath);
    }
  }

  // ==========================================
  // Mobile Rendering
  // ==========================================

  private renderMobile(
    targetRoot: HTMLElement,
    file: TFile | null,
    bookmarks: BookmarkItemRef[],
    hierarchy: FolderHierarchyItem[],
    targetParentItem: (FolderHierarchyItem & { matchedFile: TFile }) | null,
    currentPath: string
  ) {
    const settings = this.getSettings();
    const showBookmarksSetting = settings.showBookmarks;

    const bar = createEl('div', {
      cls: 'auto-bc-header auto-bc-mobile-nav',
    });
    bar.dataset.renderedPath = currentPath;

    if (showBookmarksSetting) {
      this.renderBookmarksButtonMobile(bar, file, bookmarks);
    }

    if (file) {
      this.renderParentActionMobile(bar, file, hierarchy, targetParentItem);
    }

    this.mountMobileBar(targetRoot, bar);
  }

  private mountMobileBar(containerEl: HTMLElement, bar: HTMLElement) {
    const viewHeader = containerEl.querySelector('.view-header');
    if (!viewHeader) {
      const isEmptyTab = containerEl.classList.contains('mod-empty');
      if (isEmptyTab) {
        bar.classList.add('auto-bc-in-empty');
        containerEl.prepend(bar);
      }
      return;
    }

    // Direkt in .view-header-left einhängen, damit die Buttons nahtlos neben Zurück/Vor sitzen
    const headerLeft = viewHeader.querySelector('.view-header-left');
    if (headerLeft) {
      headerLeft.appendChild(bar);
      return;
    }

    const titleContainer = viewHeader.querySelector('.view-header-title-container');
    if (titleContainer) {
      viewHeader.insertBefore(bar, titleContainer);
      return;
    }

    viewHeader.prepend(bar);
  }

  private renderBookmarksButtonMobile(
    bar: HTMLElement,
    currentFile: TFile | null,
    bookmarks: BookmarkItemRef[]
  ) {
    const bmBtn = bar.createDiv({
      cls: 'clickable-icon view-action auto-bc-mobile-btn auto-bc-mobile-bm',
    });
    bmBtn.setAttribute('aria-label', 'Bookmarks');
    setIcon(bmBtn, 'bookmark');

    let activeMenu: Menu | null = null;
    let lastClosedTime = 0;

    bmBtn.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
    });

    bmBtn.addEventListener('pointerup', () => {
      setTimeout(() => {
        bmBtn.blur();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
    });

    bmBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Wenn das Menü bereits offen ist: durch erneuten Klick schließen (Toggle-Verhalten)
      if (activeMenu || bmBtn.hasClass('has-active-menu')) {
        activeMenu?.hide();
        activeMenu = null;
        bmBtn.removeClass('has-active-menu');
        bmBtn.blur();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        lastClosedTime = Date.now();
        return;
      }

      // Verhindert versehentliches Wiederöffnen durch nacheilende Klick-Events direkt nach dem Schließen
      if (Date.now() - lastClosedTime < 350) {
        bmBtn.blur();
        return;
      }

      const menu = new Menu();
      activeMenu = menu;
      menu.setParentElement(bmBtn);

      menu.onHide(() => {
        activeMenu = null;
        lastClosedTime = Date.now();
        bmBtn.removeClass('has-active-menu');
        bmBtn.blur();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });

      if (bookmarks.length === 0) {
        menu.addItem((item) => {
          item.setTitle('No bookmarks found').setDisabled(true);
        });
      } else {
        bookmarks.forEach((bm) => {
          const isCurrent = this.isBookmarkCurrent(bm, currentFile);
          menu.addItem((item) => {
            item
              .setTitle(bm.title)
              .setIcon('file-text')
              .setChecked(isCurrent)
              .onClick((evt: MouseEvent) => {
                this.openBookmarkItem(bm, evt, currentFile);
              });
          });
        });
      }

      if (e.clientX || e.clientY) {
        menu.showAtMouseEvent(e);
      } else {
        const rect = bmBtn.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
      }
    });
  }

  private renderParentActionMobile(
    bar: HTMLElement,
    currentFile: TFile,
    hierarchy: FolderHierarchyItem[],
    targetParentItem: (FolderHierarchyItem & { matchedFile: TFile }) | null
  ) {
    const settings = this.getSettings();
    const style = settings.mobilePathAction || 'folder-up';

    if (!targetParentItem) {
      // Keine klickbare übergeordnete Notiz vorhanden (oder Datei im Root):
      // Button wird deaktiviert (ausgegraut, nicht klickbar)
      const disabledBtn = bar.createDiv({
        cls: 'clickable-icon view-action auto-bc-mobile-btn auto-bc-mobile-up is-disabled',
      });
      disabledBtn.setAttribute('aria-label', 'No parent note');
      disabledBtn.setAttribute('aria-disabled', 'true');
      setIcon(disabledBtn, style === 'arrow-up' ? 'arrow-up' : 'folder-up');
      return;
    }

    const label =
      settings.labelMode === 'file'
        ? targetParentItem.matchedFile.basename
        : targetParentItem.name;

    const upBtn = bar.createDiv({
      cls: `clickable-icon view-action auto-bc-mobile-btn auto-bc-mobile-up ${
        style === 'parent-name' ? 'auto-bc-mobile-parent' : ''
      }`,
    });

    const tooltip = `${label} (${targetParentItem.matchedFile.basename})`;
    upBtn.setAttribute('aria-label', tooltip);

    if (style === 'parent-name') {
      const iconSpan = upBtn.createSpan({ cls: 'auto-bc-mobile-btn-icon' });
      setIcon(iconSpan, 'folder-up');
      upBtn.createSpan({ cls: 'auto-bc-mobile-parent-label', text: label });
    } else if (style === 'arrow-up') {
      setIcon(upBtn, 'arrow-up');
    } else {
      setIcon(upBtn, 'folder-up');
    }

    upBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.app.workspace.openLinkText(
        targetParentItem.matchedFile.path,
        currentFile.path
      );
    });

    upBtn.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.showMobileHierarchyMenu(e, upBtn, currentFile, hierarchy);
    });
  }

  private showMobileHierarchyMenu(
    e: MouseEvent,
    btn: HTMLElement,
    currentFile: TFile,
    hierarchy: FolderHierarchyItem[]
  ) {
    const menu = new Menu();
    menu.setParentElement(btn);
    const reversed = [...hierarchy].reverse();

    reversed.forEach((item) => {
      const label =
        this.getSettings().labelMode === 'file' && item.matchedFile
          ? item.matchedFile.basename
          : item.name;

      menu.addItem((menuItem) => {
        menuItem
          .setTitle(label)
          .setIcon(item.matchedFile ? 'file-text' : 'folder')
          .setDisabled(!item.matchedFile && !item.folderObj)
          .onClick(() => {
            if (item.matchedFile) {
              this.app.workspace.openLinkText(
                item.matchedFile.path,
                currentFile.path
              );
            } else if (item.folderObj) {
              // @ts-expect-error Obsidian private internal plugins API
              const fileExplorer = this.app.internalPlugins?.getPluginById('file-explorer');
              if (fileExplorer?.instance?.revealInFolder) {
                fileExplorer.instance.revealInFolder(item.folderObj);
              }
            }
          });
      });
    });

    if (currentFile.parent && !currentFile.parent.isRoot()) {
      menu.addSeparator();
      menu.addItem((menuItem) => {
        menuItem
          .setTitle('Reveal in file navigation')
          .setIcon('folder-open')
          .onClick(() => {
            // @ts-expect-error Obsidian private internal plugins API
            const fileExplorer = this.app.internalPlugins?.getPluginById('file-explorer');
            if (fileExplorer?.instance?.revealInFolder && currentFile.parent) {
              fileExplorer.instance.revealInFolder(currentFile.parent);
            }
          });
      });
    }

    if (e.clientX || e.clientY) {
      menu.showAtMouseEvent(e);
    } else {
      const rect = btn.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.bottom });
    }
  }

  // ==========================================
  // Desktop Rendering
  // ==========================================

  private renderDesktop(
    targetRoot: HTMLElement,
    file: TFile | null,
    bookmarks: BookmarkItemRef[],
    hierarchy: FolderHierarchyItem[],
    currentPath: string
  ) {
    const settings = this.getSettings();
    const showBookmarksSetting = settings.showBookmarks;
    const hasHierarchy = hierarchy.length > 0;

    const bar = createEl('div', {
      cls: 'auto-bc-header auto-bc-in-header',
    });
    bar.dataset.renderedPath = currentPath;

    if (showBookmarksSetting) {
      this.renderBookmarksDropdownDesktop(bar, file, bookmarks);
      bar.createSpan({ cls: 'auto-bc-divider' });
    }

    let hierarchyEl: HTMLElement | null = null;
    if (file && hasHierarchy) {
      hierarchyEl = bar.createDiv({ cls: 'auto-bc-hierarchy' });
    }

    const { titleContainer, trailingSeparator } = this.mountDesktopBar(
      targetRoot,
      bar,
      hasHierarchy
    );

    if (titleContainer && hierarchyEl && file && hasHierarchy) {
      this.desktopLeafMap.set(titleContainer, {
        file,
        hierarchy,
        hierarchyEl,
        trailingSeparatorEl: trailingSeparator,
        currentLevel: -1,
        lastWidth: 0,
      });
      this.resizeObserver.observe(titleContainer);
      this.adjustBreadcrumbCollapse(titleContainer);
    }
  }

  private mountDesktopBar(
    containerEl: HTMLElement,
    bar: HTMLElement,
    hasHierarchy: boolean
  ): { titleContainer: HTMLElement | null; trailingSeparator?: HTMLElement } {
    const viewHeader = containerEl.querySelector('.view-header');
    const titleContainer = viewHeader?.querySelector<HTMLElement>(
      '.view-header-title-container'
    );
    const titleEl = titleContainer?.querySelector<HTMLElement>('.view-header-title');

    let trailingSeparator: HTMLElement | undefined;

    if (titleContainer && titleEl) {
      if (hasHierarchy) {
        trailingSeparator = this.createSeparator(bar);
      }
      titleContainer.insertBefore(bar, titleEl);
      titleContainer.scrollLeft = 0;
      return { titleContainer, trailingSeparator };
    }

    const titleParent =
      titleContainer ||
      viewHeader?.querySelector<HTMLElement>('.view-header-left');

    if (titleParent) {
      if (hasHierarchy) {
        trailingSeparator = this.createSeparator(bar);
      }
      titleParent.prepend(bar);
      return { titleContainer: titleParent, trailingSeparator };
    }

    // New Tab (Leerer Tab) Fallback
    const isEmptyTab = containerEl.classList.contains('mod-empty');
    if (isEmptyTab) {
      bar.classList.add('auto-bc-in-empty');
      containerEl.prepend(bar);
    }

    return { titleContainer: null };
  }

  private adjustBreadcrumbCollapse(titleContainer: HTMLElement) {
    const data = this.desktopLeafMap.get(titleContainer);
    if (!data) return;

    const { file, hierarchy, hierarchyEl, trailingSeparatorEl } = data;
    const N = hierarchy.length;
    if (N === 0) return;

    const availableWidth = titleContainer.clientWidth;
    if (availableWidth <= 0) return;

    const titleEl = titleContainer.querySelector<HTMLElement>('.view-header-title');
    const bar = titleContainer.querySelector<HTMLElement>('.auto-bc-header');
    if (!bar) return;

    // Reserve width for title: at least 70px so the file name remains visible and readable
    const desiredTitleWidth = Math.min(titleEl?.scrollWidth || 70, 70);
    const maxBarWidth = Math.max(availableWidth - desiredTitleWidth, 30);

    const candidateLevels: number[] = [0];
    if (N >= 3) candidateLevels.push(1);
    if (N >= 2) candidateLevels.push(2);
    candidateLevels.push(3);
    candidateLevels.push(4);

    let chosenLevel = 4;

    for (const level of candidateLevels) {
      if (level === 4) {
        chosenLevel = 4;
        break;
      }
      this.renderHierarchyLevel(hierarchyEl, file, hierarchy, level);
      if (trailingSeparatorEl) {
        trailingSeparatorEl.style.display = '';
      }
      if (bar.scrollWidth <= maxBarWidth) {
        chosenLevel = level;
        break;
      }
    }

    if (chosenLevel === 4) {
      hierarchyEl.empty();
      if (trailingSeparatorEl) {
        trailingSeparatorEl.style.display = 'none';
      }
    } else if (data.currentLevel !== chosenLevel) {
      this.renderHierarchyLevel(hierarchyEl, file, hierarchy, chosenLevel);
      if (trailingSeparatorEl) {
        trailingSeparatorEl.style.display = '';
      }
    }

    data.currentLevel = chosenLevel;
    data.lastWidth = availableWidth;
  }

  private getEntriesForLevel(
    hierarchy: FolderHierarchyItem[],
    level: number
  ): HierarchyDisplayEntry[] {
    const N = hierarchy.length;
    if (N === 0) return [];

    switch (level) {
      case 0:
        return hierarchy.map((item) => ({ type: 'item', item }));
      case 1:
        if (N >= 3) {
          return [
            { type: 'item', item: hierarchy[0] },
            { type: 'ellipsis', collapsed: hierarchy.slice(1, N - 1) },
            { type: 'item', item: hierarchy[N - 1] },
          ];
        }
        return hierarchy.map((item) => ({ type: 'item', item }));
      case 2:
        if (N >= 2) {
          return [
            { type: 'ellipsis', collapsed: hierarchy.slice(0, N - 1) },
            { type: 'item', item: hierarchy[N - 1] },
          ];
        }
        return hierarchy.map((item) => ({ type: 'item', item }));
      case 3:
        return [{ type: 'ellipsis', collapsed: hierarchy.slice(0) }];
      default:
        return [];
    }
  }

  private renderHierarchyLevel(
    hierarchyEl: HTMLElement,
    currentFile: TFile,
    hierarchy: FolderHierarchyItem[],
    level: number
  ) {
    hierarchyEl.empty();
    const entries = this.getEntriesForLevel(hierarchy, level);

    entries.forEach((entry, index) => {
      if (index > 0) {
        this.createSeparator(hierarchyEl);
      }

      if (entry.type === 'item') {
        const item = entry.item;
        const label =
          this.getSettings().labelMode === 'file' && item.matchedFile
            ? item.matchedFile.basename
            : item.name;

        let el: HTMLElement;
        if (item.matchedFile) {
          const matchedFile = item.matchedFile;
          el = hierarchyEl.createEl('a', {
            text: label,
            cls: 'auto-bc-link',
          });
          el.setAttribute('title', label);

          el.onclick = (e: MouseEvent) => {
            e.preventDefault();
            this.app.workspace.openLinkText(
              matchedFile.path,
              currentFile.path
            );
          };
        } else {
          el = hierarchyEl.createSpan({
            text: label,
            cls: 'auto-bc-static',
          });
          el.setAttribute('title', label);
        }

        el.addEventListener('contextmenu', (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.showContextMenu(e, item.folderObj || item.matchedFile, item.path);
        });
      } else if (entry.type === 'ellipsis') {
        const collapsed = entry.collapsed;
        const ellipsisEl = hierarchyEl.createEl('a', {
          text: '…',
          cls: 'auto-bc-link auto-bc-ellipsis',
        });
        ellipsisEl.setAttribute('aria-label', `${collapsed.length} folders`);
        ellipsisEl.setAttribute(
          'title',
          `${collapsed.map((c) => c.name).join(' / ')} (${collapsed.length} hidden folders - click to show)`
        );

        ellipsisEl.addEventListener('click', (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.showCollapsedMenu(e, collapsed, currentFile);
        });

        ellipsisEl.addEventListener('contextmenu', (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.showCollapsedMenu(e, collapsed, currentFile);
        });
      }
    });
  }

  private showCollapsedMenu(
    e: MouseEvent,
    collapsed: FolderHierarchyItem[],
    currentFile: TFile
  ) {
    const menu = new Menu();

    collapsed.forEach((item) => {
      const label =
        this.getSettings().labelMode === 'file' && item.matchedFile
          ? item.matchedFile.basename
          : item.name;

      menu.addItem((menuItem) => {
        menuItem
          .setTitle(label)
          .setIcon(item.matchedFile ? 'file-text' : 'folder')
          .onClick(() => {
            if (item.matchedFile) {
              this.app.workspace.openLinkText(
                item.matchedFile.path,
                currentFile.path
              );
            } else if (item.folderObj) {
              // @ts-expect-error Obsidian private internal plugins API
              const fileExplorer = this.app.internalPlugins?.getPluginById('file-explorer');
              if (fileExplorer?.instance?.revealInFolder) {
                fileExplorer.instance.revealInFolder(item.folderObj);
              }
            }
          });
      });
    });

    if (e.clientX || e.clientY) {
      menu.showAtMouseEvent(e);
    } else {
      const target = e.target as HTMLElement | null;
      if (target) {
        const rect = target.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
      }
    }
  }

  private renderBookmarksDropdownDesktop(
    bar: HTMLElement,
    currentFile: TFile | null,
    bookmarks: BookmarkItemRef[]
  ) {
    const wrapper = bar.createDiv({ cls: 'auto-bc-bm-wrapper' });
    const trigger = wrapper.createEl('a', {
      cls: 'auto-bc-bm-trigger',
    });

    const iconSpan = trigger.createSpan({
      cls: 'auto-bc-bm-icon',
    });
    setIcon(iconSpan, 'bookmark');

    const arrow = trigger.createSpan({
      cls: 'auto-bc-bm-arrow',
    });
    setIcon(arrow, 'chevron-down');

    const menu = wrapper.createDiv({ cls: 'auto-bc-bm-menu' });
    const menuInner = menu.createDiv({
      cls: 'auto-bc-bm-menu-inner',
    });

    wrapper.addEventListener('mouseenter', () => {
      wrapper.classList.add('is-open');
      wrapper.classList.remove('is-closed');
    });

    wrapper.addEventListener('mouseleave', () => {
      wrapper.classList.remove('is-open');
      wrapper.classList.remove('is-closed');
      trigger.blur();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });

    trigger.addEventListener('pointerup', () => {
      setTimeout(() => {
        trigger.blur();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
    });

    trigger.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const isOpen = wrapper.classList.contains('is-open');
      if (isOpen) {
        wrapper.classList.remove('is-open');
        wrapper.classList.add('is-closed');
      } else {
        wrapper.classList.add('is-open');
        wrapper.classList.remove('is-closed');
      }

      trigger.blur();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });

    if (bookmarks.length === 0) {
      const emptyItem = menuInner.createDiv({
        cls: 'auto-bc-bm-item',
      });
      emptyItem.style.opacity = '0.5';
      emptyItem.style.cursor = 'default';
      emptyItem.createSpan({ text: 'No bookmarks found' });
    } else {
      bookmarks.forEach((bm) => {
        const isCurrent = this.isBookmarkCurrent(bm, currentFile);

        const item = menuInner.createEl('a', {
          cls: `auto-bc-bm-item ${isCurrent ? 'is-current' : ''}`,
        });

        const itemIcon = item.createSpan({
          cls: 'auto-bc-bm-item-icon',
        });
        setIcon(itemIcon, 'file-text');
        item.createSpan({ text: bm.title });

        const handleOpen = (e: MouseEvent) => {
          e.preventDefault();
          wrapper.classList.remove('is-open');
          wrapper.classList.add('is-closed');

          this.openBookmarkItem(bm, e, currentFile);
        };

        item.onclick = handleOpen;
        item.onauxclick = (e: MouseEvent) => {
          if (e.button === 1) {
            handleOpen(e);
          }
        };
      });
    }
  }

  showContextMenu(e: MouseEvent, target: TAbstractFile | null, path: string) {
    const menu = new Menu();

    menu.addItem((menuItem) => {
      menuItem
        .setTitle('Reveal in file navigation')
        .setIcon('folder-open')
        .onClick(() => {
          // @ts-expect-error Obsidian private internal plugins API
          const fileExplorer = this.app.internalPlugins?.getPluginById('file-explorer');
          if (fileExplorer?.instance?.revealInFolder && target) {
            fileExplorer.instance.revealInFolder(target);
          }
        });
    });

    const appWithExplorer = this.app as App & {
      showInFolder?: (path: string) => void;
    };
    if (Platform.isDesktop && typeof appWithExplorer.showInFolder === 'function') {
      menu.addItem((menuItem) => {
        menuItem
          .setTitle('Show in system explorer')
          .setIcon('external-link')
          .onClick(() => {
            appWithExplorer.showInFolder?.(path);
          });
      });
    }

    menu.showAtMouseEvent(e);
  }

  private openBookmarkItem(
    bm: BookmarkItemRef,
    e?: MouseEvent,
    currentFile?: TFile | null
  ) {
    // @ts-expect-error Obsidian private internal plugins API
    const bmPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
    const isMod = e ? Keymap.isModEvent(e) : false;

    if (
      bmPlugin?.enabled &&
      typeof bmPlugin.instance?.openBookmark === 'function' &&
      bm.rawItem
    ) {
      bmPlugin.instance.openBookmark(bm.rawItem, isMod, { eState: { focus: true } });
      return;
    }

    const fullPath = bm.subpath
      ? `${bm.path}${bm.subpath.startsWith('#') ? bm.subpath : '#' + bm.subpath}`
      : bm.path;

    this.app.workspace.openLinkText(
      fullPath,
      currentFile ? currentFile.path : '',
      isMod,
      { eState: { focus: true } }
    );
  }

  private isBookmarkCurrent(
    bm: BookmarkItemRef,
    currentFile: TFile | null
  ): boolean {
    if (!currentFile || currentFile.path !== bm.path) {
      return false;
    }

    const activeView: any =
      this.app.workspace.getActiveViewOfType(FileView) ||
      this.app.workspace.activeLeaf?.view;

    const baseViewName = activeView?.queryController?.viewName;

    if (bm.subpath) {
      if (baseViewName) {
        const cleanSubpath = bm.subpath.replace(/^#/, '').trim().toLowerCase();
        return cleanSubpath === String(baseViewName).trim().toLowerCase();
      }
      return false;
    }

    if (baseViewName) {
      return false;
    }

    return true;
  }

  private createSeparator(parent: HTMLElement): HTMLElement {
    const sep = parent.createSpan({
      cls: 'auto-bc-separator',
    });
    setIcon(sep, 'chevron-right');
    return sep;
  }
}
