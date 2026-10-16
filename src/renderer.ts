import { App, FileView, Platform, setIcon, TFile } from 'obsidian';
import { AutoBreadcrumbsSettings, BookmarkItemRef, FolderHierarchyItem } from './types';
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
      .querySelectorAll<HTMLElement>('.view-header-breadcrumb, .view-header-breadcrumb-separator')
      .forEach((el) => {
        el.style.display = '';
      });
  }

  updateActiveLeaf() {
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf || !leaf.view) {
      this.removeAll();
      return;
    }

    const view = leaf.view;
    const file = view instanceof FileView && view.file ? view.file : null;

    this.render(file, view.containerEl);
  }

  render(file: TFile | null, containerEl?: HTMLElement) {
    const leaf = this.app.workspace.activeLeaf;
    const targetRoot = containerEl || leaf?.view?.containerEl;
    if (!targetRoot) return;

    this.removeFromContainer(targetRoot);

    const settings = this.getSettings();
    // Prüfen, ob das Setting aktiv ist (unabhängig davon, ob gerade Bookmarks existieren)
    const showBookmarksSetting = settings.showBookmarks;
    const bookmarkedFiles = showBookmarksSetting ? this.resolver.getBookmarkedFiles() : [];

    const hierarchy: FolderHierarchyItem[] = file ? this.resolver.getFolderHierarchy(file) : [];

    // Wenn weder das Setting an ist noch eine Hierarchie existiert, abbrechen
    if (!showBookmarksSetting && hierarchy.length === 0) return;

    const placeInHeader =
      settings.positionMode === 'header'
        ? true
        : settings.positionMode === 'editor'
        ? false
        : !Platform.isMobile;

    const bar = createEl('div', {
      cls: `auto-bc-header ${placeInHeader ? 'auto-bc-in-header' : 'auto-bc-in-editor'}`,
    });

    // Das Lesezeichen-Icon wird immer gezeichnet, wenn das Setting an ist
    if (showBookmarksSetting) {
      this.renderBookmarksDropdown(bar, file, bookmarkedFiles, hierarchy.length > 0);
    }

    if (file && hierarchy.length > 0) {
      // Wenn Bookmarks aktiv sind UND eine Hierarchie folgt, zeichnen wir den Divider dazwischen!
      if (showBookmarksSetting) {
        bar.createSpan({ cls: 'auto-bc-divider' });
      }
      this.renderHierarchyLinks(bar, file, hierarchy);
    }

    this.mountBar(targetRoot, bar, placeInHeader, hierarchy.length > 0);
  }

  private renderBookmarksDropdown(
    bar: HTMLElement,
    currentFile: TFile | null,
    bookmarks: BookmarkItemRef[],
    hasHierarchy: boolean
  ) {
    // Wenn eine Hierarchie folgt, bekommt er die Klasse, sonst nicht
    const wrapper = bar.createDiv({
      cls: `auto-bc-bm-wrapper ${hasHierarchy ? 'has-hierarchy' : ''}`
    });

    const trigger = wrapper.createEl('a', { cls: 'auto-bc-bm-trigger' });
    const iconSpan = trigger.createSpan({ cls: 'auto-bc-bm-icon' });
    setIcon(iconSpan, 'bookmark');

    const arrow = trigger.createSpan({ text: '▾' });
    arrow.style.fontSize = '0.8em';
    arrow.style.opacity = '0.6';

    const menu = wrapper.createDiv({ cls: 'auto-bc-bm-menu' });
    const menuInner = menu.createDiv({ cls: 'auto-bc-bm-menu-inner' });

    wrapper.addEventListener('mouseleave', () => {
      wrapper.classList.remove('is-closed');
    });

    trigger.onclick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const isOpen =
        wrapper.classList.contains('is-open') ||
        (wrapper.matches(':hover') && !wrapper.classList.contains('is-closed'));

      if (isOpen) {
        wrapper.classList.remove('is-open');
        wrapper.classList.add('is-closed');
      } else {
        wrapper.classList.remove('is-closed');
        wrapper.classList.add('is-open');
      }
    };

    if (bookmarks.length === 0) {
      const emptyItem = menuInner.createDiv({ cls: 'auto-bc-bm-item' });
      emptyItem.style.opacity = '0.5';
      emptyItem.style.cursor = 'default';
      emptyItem.createSpan({ text: 'No bookmarks found' });
    } else {
      bookmarks.forEach((bm) => {
        const isCurrent = currentFile ? currentFile.path === bm.path : false;
        const item = menuInner.createEl('a', {
          cls: `auto-bc-bm-item ${isCurrent ? 'is-current' : ''}`,
        });

        const itemIcon = item.createSpan({ cls: 'auto-bc-bm-item-icon' });
        setIcon(itemIcon, 'file-text');
        item.createSpan({ text: bm.title });

        item.onclick = (e: MouseEvent) => {
          e.preventDefault();
          wrapper.classList.remove('is-open');
          wrapper.classList.add('is-closed');
          this.app.workspace.openLinkText(bm.path, currentFile ? currentFile.path : '');
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
        bar.createSpan({ text: '›', cls: 'auto-bc-separator' });
      }

      if (item.matchedFile) {
        const matchedFile = item.matchedFile;
        const link = bar.createEl('a', { text: item.name, cls: 'auto-bc-link' });
        link.onclick = (e: MouseEvent) => {
          e.preventDefault();
          this.app.workspace.openLinkText(matchedFile.path, currentFile.path);
        };
      } else {
        bar.createSpan({ text: item.name, cls: 'auto-bc-static' });
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
      // Wir suchen exakt nach deinem genannten Container in der Titelleiste
      const titleParent =
        viewHeader?.querySelector('.view-header-title-container') ||
        viewHeader?.querySelector('.view-header-left') ||
        viewHeader;

      if (titleParent) {
        titleParent
          .querySelectorAll<HTMLElement>('.view-header-breadcrumb, .view-header-breadcrumb-separator')
          .forEach((el) => {
            el.style.display = 'none';
          });

        if (hasHierarchy) {
          const sep = bar.createSpan({ text: '›', cls: 'auto-bc-separator' });
          sep.style.marginLeft = '2px';
        }
        titleParent.prepend(bar);
        return;
      }
    }

    // Editor-Fallback oder wenn Header erzwungen deaktiviert ist
    const targetContainer =
      containerEl.querySelector('.cm-sizer') ||
      containerEl.querySelector('.markdown-preview-sizer') ||
      containerEl.querySelector('.view-content');

    if (targetContainer) {
      targetContainer.prepend(bar);
    }
  }
}
