
import { App, FileView, Platform, setIcon, TFile, View } from 'obsidian';
import {
  AutoBreadcrumbsSettings,
  BookmarkItemRef,
  FolderHierarchyItem,
} from './types';
import { BreadcrumbResolver } from './resolver';

export class BreadcrumbRenderer {
  constructor(
    private app: App,
    private resolver: BreadcrumbResolver,
    private getSettings: () => AutoBreadcrumbsSettings
  ) {}

  removeAll() {
    document.querySelectorAll('.auto-bc-header').forEach((el) => el.remove());
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
    const view = this.app.workspace.getActiveViewOfType(View);

    if (!view) {
      this.removeAll();
      return;
    }

    const file =
      view instanceof FileView && view.file ? view.file : null;

    this.render(file, view.containerEl);
  }

  render(file: TFile | null, containerEl?: HTMLElement) {
    const targetRoot =
      containerEl ??
      this.app.workspace.getActiveViewOfType(View)?.containerEl;

    if (!targetRoot) return;

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

    // Ohne Bookmarks und ohne Hierarchie gibt es nichts zu rendern.
    if (!showBookmarksSetting && !hasHierarchy) return;

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

    // Bookmarks unabhängig von der geöffneten Datei anzeigen.
    if (showBookmarksSetting) {
      this.renderBookmarksDropdown(bar, file, bookmarkedFiles);

      // Vertikaler Divider immer direkt nach dem Bookmark-Button.
      bar.createSpan({ cls: 'auto-bc-divider' });
    }

    // Die Ordnerhierarchie nur anzeigen, wenn sie vorhanden ist.
    if (file && hasHierarchy) {
      this.renderHierarchyLinks(bar, file, hierarchy);
    }

    this.mountBar(targetRoot, bar, placeInHeader, hasHierarchy);
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

    wrapper.addEventListener('mouseleave', () => {
      wrapper.classList.remove('is-closed');
    });

    trigger.onclick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const isOpen =
        wrapper.classList.contains('is-open') ||
        (wrapper.matches(':hover') &&
          !wrapper.classList.contains('is-closed'));

      if (isOpen) {
        wrapper.classList.remove('is-open');
        wrapper.classList.add('is-closed');
      } else {
        wrapper.classList.remove('is-closed');
        wrapper.classList.add('is-open');
      }
    };

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

      const label = this.getSettings().labelMode === 'file' && item.matchedFile ? item.matchedFile.basename : item.name;
      if (item.matchedFile) {
        const matchedFile = item.matchedFile;
        const link = bar.createEl('a', {
          text: label,
          cls: 'auto-bc-link',
        });

        link.onclick = (e: MouseEvent) => {
          e.preventDefault();

          this.app.workspace.openLinkText(
            matchedFile.path,
            currentFile.path
          );
        };
      } else {
        bar.createSpan({
          text: label,
          cls: 'auto-bc-static',
        });
      }
    });
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
        viewHeader?.querySelector('.view-header-left') ||
        viewHeader;

      if (titleParent) {
        titleParent
          .querySelectorAll<HTMLElement>(
            '.view-header-breadcrumb, .view-header-breadcrumb-separator'
          )
          .forEach((el) => {
            el.style.display = 'none';
          });

        // Chevron vor dem nativen Titel nur dann,
        // wenn tatsächlich eine Hierarchie angezeigt wird.
        if (hasHierarchy) {
          this.createSeparator(bar);
        }

        titleParent.prepend(bar);
        return;
      }
    }

    // Editor-Fallback oder erzwungene Editor-Position.
    const targetContainer =
      containerEl.querySelector('.cm-sizer') ||
      containerEl.querySelector('.markdown-preview-sizer') ||
      containerEl.querySelector('.view-content');

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
