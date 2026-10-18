import { App, FileView, Menu, Platform, setIcon, TAbstractFile, TFile, View } from 'obsidian';
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

    const hierarchy: FolderHierarchyItem[] = file
      ? this.resolver.getFolderHierarchy(file)
      : [];

    const hasHierarchy = hierarchy.length > 0;

    if (!showBookmarksSetting && !hasHierarchy) {
      this.lastRenderedPath = null;
      return;
    }

    const placeInHeader =
      settings.positionMode === 'header'
        ? true
        : settings.positionMode === 'editor'
          ? false
          : !Platform.isMobile;

    const bar = createEl('div', {
      cls: `auto-bc-header ${
        placeInHeader ? 'auto-bc-in-header' : 'auto-bc-in-editor'
      }`,
    });

    if (showBookmarksSetting) {
      this.renderBookmarksDropdown(bar, file, bookmarkedFiles);
      bar.createSpan({ cls: 'auto-bc-divider' });
    }

    if (file && hasHierarchy) {
      this.renderHierarchyLinks(bar, file, hierarchy);
    }

    this.mountBar(targetRoot, bar, placeInHeader, hasHierarchy);
    this.lastRenderedPath = currentPath;
  }

  private renderBookmarksDropdown(
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

    const isMobile = Platform.isMobile;
    if (isMobile) {
      trigger.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = wrapper.classList.contains('is-open');
        wrapper.classList.toggle('is-open', !isOpen);
        wrapper.classList.remove('is-closed');
      });
    } else {
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
    }

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

  private renderHierarchyLinks(
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
    if (!Platform.isMobile && typeof appWithExplorer.showInFolder === 'function') {
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

  private mountBar(
    containerEl: HTMLElement,
    bar: HTMLElement,
    placeInHeader: boolean,
    hasHierarchy: boolean
  ) {
    if (placeInHeader) {
      const viewHeader = containerEl.querySelector('.view-header');

      const titleParent =
        viewHeader?.querySelector('.view-header-title-container') ||
        viewHeader?.querySelector('.view-header-left');

      if (titleParent) {
        titleParent
          .querySelectorAll<HTMLElement>(
            '.view-header-breadcrumb, .view-header-breadcrumb-separator'
          )
          .forEach((el) => {
            el.style.display = 'none';
          });

        if (hasHierarchy) {
          this.createSeparator(bar);
        }

        titleParent.prepend(bar);
        return;
      }
    }

    // New Tab (Leerer Tab) oder Editor-Fallback
    const isEmptyTab = containerEl.classList.contains('mod-empty');
    if (isEmptyTab) {
      bar.classList.add('auto-bc-in-empty');
      containerEl.prepend(bar);
      return;
    }

    // Regulärer Editor-Modus
    const targetContainer =
      containerEl.querySelector('.cm-sizer') ||
      containerEl.querySelector('.markdown-preview-sizer') ||
      containerEl.querySelector('.view-content') ||
      containerEl;

    if (targetContainer) {
      targetContainer.prepend(bar);
    }
  }

  private createSeparator(parent: HTMLElement): HTMLElement {
    const sep = parent.createSpan({
      cls: 'auto-bc-separator',
    });
    setIcon(sep, 'chevron-right');
    return sep;
  }
}
