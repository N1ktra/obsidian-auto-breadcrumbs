import { App, MarkdownView, Platform, setIcon, TFile } from 'obsidian';
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

  restoreNativeBreadcrumbs() {
    document
      .querySelectorAll<HTMLElement>('.view-header-breadcrumb, .view-header-breadcrumb-separator')
      .forEach((el) => {
        el.style.display = '';
      });
  }

  render(file: TFile) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    this.removeAll();

    const settings = this.getSettings();
    const hierarchy = this.resolver.getFolderHierarchy(file);
    const bookmarkedFiles = settings.showBookmarks ? this.resolver.getBookmarkedFiles() : [];
    const hasBookmarks = bookmarkedFiles.length > 0;

    if (!hasBookmarks && hierarchy.length === 0) return;

    const placeInHeader =
      settings.positionMode === 'header'
        ? true
        : settings.positionMode === 'editor'
        ? false
        : !Platform.isMobile;

    const bar = createEl('div', {
      cls: `auto-bc-header ${placeInHeader ? 'auto-bc-in-header' : 'auto-bc-in-editor'}`,
    });

    if (hasBookmarks) {
      this.renderBookmarksDropdown(bar, file, bookmarkedFiles, hierarchy.length > 0);
    }

    this.renderHierarchyLinks(bar, file, hierarchy);
    this.mountBar(view, bar, placeInHeader, hierarchy.length > 0);
  }

  private renderBookmarksDropdown(
    bar: HTMLElement,
    currentFile: TFile,
    bookmarks: BookmarkItemRef[],
    hasHierarchyAfter: boolean
  ) {
    const wrapper = bar.createDiv({ cls: 'auto-bc-bm-wrapper' });

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

    bookmarks.forEach((bm) => {
      const isCurrent = currentFile.path === bm.path;
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
        this.app.workspace.openLinkText(bm.path, currentFile.path);
      };
    });

    if (hasHierarchyAfter) {
      bar.createSpan({ cls: 'auto-bc-divider' });
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

      const matchedFile = this.resolver.findMatchingFile(item);

      if (matchedFile) {
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
    view: MarkdownView,
    bar: HTMLElement,
    placeInHeader: boolean,
    hasHierarchy: boolean
  ) {
    if (placeInHeader) {
      const viewHeader = view.containerEl.querySelector('.view-header');
      const titleParent =
        viewHeader?.querySelector('.view-header-title-container') || viewHeader;

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

    const viewContainer = view.containerEl;
    const targetContainer =
      viewContainer.querySelector('.cm-sizer') ||
      viewContainer.querySelector('.markdown-preview-sizer') ||
      view.contentEl;
    targetContainer.prepend(bar);
  }
}
