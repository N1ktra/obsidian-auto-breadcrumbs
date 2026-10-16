import {
  Plugin,
  MarkdownView,
  Platform,
  setIcon,
  TFile,
  TFolder
} from 'obsidian';
import {
  AutoBreadcrumbsSettings,
  DEFAULT_SETTINGS,
  AutoBreadcrumbsSettingTab
} from './settings';

interface FolderHierarchyItem {
  name: string;
  path: string;
  folderObj: TFolder;
}

interface BookmarkItemRef {
  title: string;
  path: string;
  file: TFile;
}

export default class AutoBreadcrumbsPlugin extends Plugin {
  settings: AutoBreadcrumbsSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AutoBreadcrumbsSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (!file) {
          this.removeBreadcrumbs();
          return;
        }
        requestAnimationFrame(() => this.renderBreadcrumbs(file));
      })
    );

    this.app.workspace.onLayoutReady(() => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        this.renderBreadcrumbs(activeFile);
      }
    });

    this.registerDomEvent(document, 'click', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.auto-bc-bm-wrapper')) {
        document.querySelectorAll('.auto-bc-bm-wrapper').forEach((el) => {
          el.classList.remove('is-open');
          el.classList.remove('is-closed');
        });
      }
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) this.renderBreadcrumbs(activeFile);
  }

  cleanName(name: string): string {
    if (!this.settings.ignorePrefix) return name.trim();
    return name
      .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s\-_0-9.]+/u, '')
      .trim();
  }

  getExtensions(): string[] {
    return this.settings.allowedExtensions
      .split(',')
      .map((ext) => ext.trim().toLowerCase().replace(/^\./, ''))
      .filter((ext) => ext.length > 0);
  }

  getBookmarkedFiles(): BookmarkItemRef[] {
    // @ts-expect-error Obsidian private internal plugins API
    const bmPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
    if (!bmPlugin || !bmPlugin.enabled) return [];

    const items = bmPlugin.instance?.items || [];
    const result: BookmarkItemRef[] = [];

    const extractItems = (list: any[]) => {
      for (const item of list) {
        if (item.type === 'file') {
          const file = this.app.vault.getAbstractFileByPath(item.path);
          if (file instanceof TFile) {
            result.push({
              title: item.title || file.basename,
              path: file.path,
              file: file,
            });
          }
        } else if (item.type === 'group' && Array.isArray(item.items)) {
          extractItems(item.items);
        }
      }
    };

    extractItems(items);
    return result;
  }

  findMatchingFile(folderItem: FolderHierarchyItem): TFile | null {
    const targetClean = this.cleanName(folderItem.name).toLowerCase();
    const allowedExts = this.getExtensions();
    const files = this.app.vault
      .getFiles()
      .filter((f) => allowedExts.includes(f.extension.toLowerCase()));

    // Priority 1: Note located directly inside the folder
    const insideFolder = files.find((f) => {
      const isInside = f.parent && f.parent.path === folderItem.path;
      const fNameClean = this.cleanName(f.basename).toLowerCase();
      return isInside && (fNameClean === targetClean || f.basename.toLowerCase() === folderItem.name.toLowerCase());
    });
    if (insideFolder) return insideFolder;

    // Priority 2: Note located in the direct parent folder (one level up)
    const parentOfFolder = folderItem.folderObj?.parent;
    if (parentOfFolder) {
      const parentFolderPath = parentOfFolder.path;
      const besideFolder = files.find((f) => {
        const isBeside = f.parent && f.parent.path === parentFolderPath;
        const fNameClean = this.cleanName(f.basename).toLowerCase();
        return isBeside && (fNameClean === targetClean || f.basename.toLowerCase() === folderItem.name.toLowerCase());
      });
      if (besideFolder) return besideFolder;
    }

    return null;
  }

  removeBreadcrumbs() {
    document.querySelectorAll('.auto-bc-header').forEach((el) => el.remove());
  }

  renderBreadcrumbs(file: TFile) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    this.removeBreadcrumbs();

    const hierarchy: FolderHierarchyItem[] = [];
    let cur = file.parent;
    while (cur && !cur.isRoot()) {
      hierarchy.unshift({ name: cur.name, path: cur.path, folderObj: cur });
      cur = cur.parent;
    }

    const currentClean = this.cleanName(file.basename).toLowerCase();
    if (hierarchy.length > 0) {
      const lastFolderClean = this.cleanName(hierarchy[hierarchy.length - 1].name).toLowerCase();
      if (lastFolderClean === currentClean) {
        hierarchy.pop();
      }
    }

    const bookmarkedFiles = this.settings.showBookmarks ? this.getBookmarkedFiles() : [];
    const hasBookmarks = bookmarkedFiles.length > 0;

    if (!hasBookmarks && hierarchy.length === 0) return;

    let placeInHeader = false;
    if (this.settings.positionMode === 'header') {
      placeInHeader = true;
    } else if (this.settings.positionMode === 'editor') {
      placeInHeader = false;
    } else {
      placeInHeader = !Platform.isMobile;
    }

    const bar = createEl('div', {
      cls: `auto-bc-header ${placeInHeader ? 'auto-bc-in-header' : 'auto-bc-in-editor'}`,
    });

    // 1. Bookmarks Dropdown
    if (hasBookmarks) {
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

      bookmarkedFiles.forEach((bm) => {
        const isCurrent = file.path === bm.path;
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
          this.app.workspace.openLinkText(bm.path, file.path);
        };
      });

      if (hierarchy.length > 0) {
        bar.createSpan({ cls: 'auto-bc-divider' });
      }
    }

    // 2. Breadcrumbs path
    hierarchy.forEach((item, index) => {
      if (index > 0) {
        bar.createSpan({ text: '›', cls: 'auto-bc-separator' });
      }

      const matchedFile = this.findMatchingFile(item);

      if (matchedFile) {
        const link = bar.createEl('a', { text: item.name, cls: 'auto-bc-link' });
        link.onclick = (e: MouseEvent) => {
          e.preventDefault();
          this.app.workspace.openLinkText(matchedFile.path, file.path);
        };
      } else {
        bar.createSpan({ text: item.name, cls: 'auto-bc-static' });
      }
    });

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

        if (hierarchy.length > 0) {
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

  onunload() {
    this.removeBreadcrumbs();
    document
      .querySelectorAll<HTMLElement>('.view-header-breadcrumb, .view-header-breadcrumb-separator')
      .forEach((el) => {
        el.style.display = '';
      });
  }
}
