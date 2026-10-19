import { App, FileView, Menu, Platform, setIcon, TAbstractFile, TFile } from 'obsidian';
import {
  AutoBreadcrumbsSettings,
  BookmarkItemRef,
  FolderHierarchyItem,
} from './types';
import { BreadcrumbResolver } from './resolver';

export class BreadcrumbRenderer {
  private lastRenderedPath: string | null = null;

  constructor(
    private app: App,
    private resolver: BreadcrumbResolver,
    private getSettings: () => AutoBreadcrumbsSettings
  ) {}

  removeAll() {
    document.querySelectorAll('.auto-bc-header').forEach((el) => el.remove());
    this.lastRenderedPath = null;
  }

  removeFromContainer(container: HTMLElement) {
    container.querySelectorAll('.auto-bc-header').forEach((el) => el.remove());
  }

  private hideNativeBreadcrumbs(containerEl: HTMLElement) {
    containerEl
      .querySelectorAll<HTMLElement>(
        '.view-header-breadcrumb, .view-header-breadcrumb-separator'
      )
      .forEach((el) => {
        el.style.display = 'none';
      });
  }

  restoreNativeBreadcrumbs() {
    document
      .querySelectorAll<HTMLElement>(
        '.view-header-breadcrumb, .view-header-breadcrumb-separator'
      )
      .forEach((el) => {
        el.style.display = '';
      });
  }

  updateActiveLeaf() {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return;

    // 1. RootSplit-Filter: Schließt ausnahmslos alle Panels in Seitenleisten/Drawers aus
    if (leaf.getRoot() !== this.app.workspace.rootSplit) {
      return;
    }

    const view = leaf.view;
    if (!view) return;

    // 2. Typprüfung: Nur FileViews mit Datei oder der New-Tab ('empty')
    const isFileView = view instanceof FileView && !!view.file;
    const isEmptyView = view.getViewType() === 'empty';

    if (!isFileView && !isEmptyView) {
      return;
    }

    const file = isFileView ? view.file : null;
    this.render(file, view.containerEl);
  }

  render(file: TFile | null, containerEl?: HTMLElement) {
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

    // 4. Idempotenz-Schutz: Verhindert DOM-Mutationen während laufender Touch-Gesten
    const currentPath = file ? file.path : '__empty__';
    const existingBar = targetRoot.querySelector('.auto-bc-header');
    if (existingBar && this.lastRenderedPath === currentPath) {
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
        this.lastRenderedPath = null;
        return;
      }

      this.renderMobile(targetRoot, file, bookmarkedFiles, hierarchy, targetParentItem);
    } else {
      const hierarchy: FolderHierarchyItem[] = file
        ? this.resolver.getFolderHierarchy(file)
        : [];

      const hasHierarchy = hierarchy.length > 0;

      if (!showBookmarksSetting && !hasHierarchy) {
        this.lastRenderedPath = null;
        return;
      }

      this.renderDesktop(targetRoot, file, bookmarkedFiles, hierarchy);
    }

    this.lastRenderedPath = currentPath;
  }

  // ==========================================
  // Mobile Rendering
  // ==========================================

  private renderMobile(
    targetRoot: HTMLElement,
    file: TFile | null,
    bookmarks: BookmarkItemRef[],
    hierarchy: FolderHierarchyItem[],
    targetParentItem: (FolderHierarchyItem & { matchedFile: TFile }) | null
  ) {
    const settings = this.getSettings();
    const showBookmarksSetting = settings.showBookmarks;

    const bar = createEl('div', {
      cls: 'auto-bc-header auto-bc-mobile-nav',
    });

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

    bmBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const menu = new Menu();
      if (bookmarks.length === 0) {
        menu.addItem((item) => {
          item.setTitle('No bookmarks found').setDisabled(true);
        });
      } else {
        bookmarks.forEach((bm) => {
          const isCurrent = currentFile ? currentFile.path === bm.path : false;
          menu.addItem((item) => {
            item
              .setTitle(bm.title)
              .setIcon('file-text')
              .setChecked(isCurrent)
              .onClick(() => {
                this.app.workspace.openLinkText(
                  bm.path,
                  currentFile ? currentFile.path : ''
                );
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
    hierarchy: FolderHierarchyItem[]
  ) {
    const settings = this.getSettings();
    const showBookmarksSetting = settings.showBookmarks;
    const hasHierarchy = hierarchy.length > 0;

    const bar = createEl('div', {
      cls: 'auto-bc-header auto-bc-in-header',
    });

    if (showBookmarksSetting) {
      this.renderBookmarksDropdownDesktop(bar, file, bookmarks);
      bar.createSpan({ cls: 'auto-bc-divider' });
    }

    if (file && hasHierarchy) {
      this.renderHierarchyLinksDesktop(bar, file, hierarchy);
    }

    this.mountDesktopBar(targetRoot, bar, hasHierarchy);
  }

  private mountDesktopBar(
    containerEl: HTMLElement,
    bar: HTMLElement,
    hasHierarchy: boolean
  ) {
    const viewHeader = containerEl.querySelector('.view-header');
    const titleParent =
      viewHeader?.querySelector('.view-header-title-container') ||
      viewHeader?.querySelector('.view-header-left');

    if (titleParent) {
      if (hasHierarchy) {
        this.createSeparator(bar);
      }
      titleParent.prepend(bar);
      return;
    }

    // New Tab (Leerer Tab) Fallback
    const isEmptyTab = containerEl.classList.contains('mod-empty');
    if (isEmptyTab) {
      bar.classList.add('auto-bc-in-empty');
      containerEl.prepend(bar);
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

    const arrow = trigger.createSpan({ text: '▾' });
    arrow.style.fontSize = '0.8em';
    arrow.style.opacity = '0.6';

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
    });

    trigger.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      wrapper.classList.remove('is-open');
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
        const isCurrent = currentFile
          ? currentFile.path === bm.path
          : false;

        const item = menuInner.createEl('a', {
          cls: `auto-bc-bm-item ${isCurrent ? 'is-current' : ''}`,
        });

        const itemIcon = item.createSpan({
          cls: 'auto-bc-bm-item-icon',
        });
        setIcon(itemIcon, 'file-text');
        item.createSpan({ text: bm.title });

        item.onclick = (e: MouseEvent) => {
          e.preventDefault();
          wrapper.classList.remove('is-open');
          wrapper.classList.add('is-closed');

          this.app.workspace.openLinkText(
            bm.path,
            currentFile ? currentFile.path : ''
          );
        };
      });
    }
  }

  private renderHierarchyLinksDesktop(
    bar: HTMLElement,
    currentFile: TFile,
    hierarchy: FolderHierarchyItem[]
  ) {
    hierarchy.forEach((item, index) => {
      if (index > 0) {
        this.createSeparator(bar);
      }

      const label =
        this.getSettings().labelMode === 'file' && item.matchedFile
          ? item.matchedFile.basename
          : item.name;

      let el: HTMLElement;
      if (item.matchedFile) {
        const matchedFile = item.matchedFile;
        el = bar.createEl('a', {
          text: label,
          cls: 'auto-bc-link',
        });

        el.onclick = (e: MouseEvent) => {
          e.preventDefault();
          this.app.workspace.openLinkText(
            matchedFile.path,
            currentFile.path
          );
        };
      } else {
        el = bar.createSpan({
          text: label,
          cls: 'auto-bc-static',
        });
      }

      el.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e, item.folderObj || item.matchedFile, item.path);
      });
    });
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

  private createSeparator(parent: HTMLElement): HTMLElement {
    const sep = parent.createSpan({
      cls: 'auto-bc-separator',
    });
    setIcon(sep, 'chevron-right');
    return sep;
  }
}
