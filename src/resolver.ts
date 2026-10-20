import { App, Platform, TFile, TFolder } from 'obsidian';
import { AutoBreadcrumbsSettings, BookmarkItemRef, FolderHierarchyItem } from './types';

export class BreadcrumbResolver {
  constructor(
    private app: App,
    private getSettings: () => AutoBreadcrumbsSettings
  ) {}

  cleanName(name: string): string {
    if (!this.getSettings().ignorePrefix) return name.trim();
    return name
      .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s\-_0-9.]+/u, '')
      .trim();
  }

  getExtensions(): string[] {
    return this.getSettings()
      .allowedExtensions.split(',')
      .map((ext) => ext.trim().toLowerCase().replace(/^\./, ''))
      .filter((ext) => ext.length > 0);
  }

  getFolderHierarchy(file: TFile, ignoreFilter = false): FolderHierarchyItem[] {
    const rawFolders: { name: string; path: string; folderObj: TFolder }[] = [];
    let cur = file.parent;

    while (cur && !cur.isRoot()) {
      rawFolders.unshift({ name: cur.name, path: cur.path, folderObj: cur });
      cur = cur.parent;
    }

    // Avoid duplicate entry if note has the same name as its immediate folder
    const currentClean = this.cleanName(file.basename).toLowerCase();
    if (rawFolders.length > 0) {
      const lastFolderClean = this.cleanName(rawFolders[rawFolders.length - 1].name).toLowerCase();
      if (lastFolderClean === currentClean) {
        rawFolders.pop();
      }
    }

    // Resolve matching note files for each folder
    const hierarchy: FolderHierarchyItem[] = rawFolders.map((folder) => ({
      ...folder,
      matchedFile: this.findMatchingFile(folder),
    }));

    if (ignoreFilter) {
      return hierarchy;
    }

    // Determine if non-clickable folders should be filtered out
    const filterMode = this.getSettings().filterMode;
    const onlyClickable = filterMode !== 'all';

    if (onlyClickable) {
      return hierarchy.filter((item) => item.matchedFile !== null);
    }

    return hierarchy;
  }

  findMatchingFile(folderItem: { name: string; path: string; folderObj: TFolder }): TFile | null {
    const targetClean = this.cleanName(folderItem.name).toLowerCase();
    const allowedExts = this.getExtensions();
    const files = this.app.vault
      .getFiles()
      .filter((f) => allowedExts.includes(f.extension.toLowerCase()));

    // Priority 1: Note located directly inside the folder
    const insideFolder = files.find((f) => {
      const isInside = f.parent && f.parent.path === folderItem.path;
      const fNameClean = this.cleanName(f.basename).toLowerCase();
      return (
        isInside &&
        (fNameClean === targetClean || f.basename.toLowerCase() === folderItem.name.toLowerCase())
      );
    });
    if (insideFolder) return insideFolder;

    // Priority 2: Note located in the direct parent folder (one level up)
    const parentOfFolder = folderItem.folderObj?.parent;
    if (parentOfFolder) {
      const parentFolderPath = parentOfFolder.path;
      const besideFolder = files.find((f) => {
        const isBeside = f.parent && f.parent.path === parentFolderPath;
        const fNameClean = this.cleanName(f.basename).toLowerCase();
        return (
          isBeside &&
          (fNameClean === targetClean || f.basename.toLowerCase() === folderItem.name.toLowerCase())
        );
      });
      if (besideFolder) return besideFolder;
    }

    return null;
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
          let itemPath = (item.path as string) || '';
          let itemSubpath = item.subpath as string | undefined;

          // In case subpath is included directly in item.path (e.g., path#subpath)
          if (!itemSubpath && itemPath.includes('#')) {
            const hashIndex = itemPath.indexOf('#');
            itemSubpath = itemPath.substring(hashIndex);
            itemPath = itemPath.substring(0, hashIndex);
          }

          const file = this.app.vault.getAbstractFileByPath(itemPath);
          if (file instanceof TFile) {
            let title = '';
            if (typeof bmPlugin.instance?.getItemTitle === 'function') {
              try {
                title = bmPlugin.instance.getItemTitle(item);
              } catch {
                title = '';
              }
            }
            if (!title) {
              if (item.title) {
                title = item.title;
              } else if (itemSubpath) {
                title = `${file.basename}${itemSubpath}`;
              } else {
                title = file.basename;
              }
            }

            result.push({
              title,
              path: file.path,
              file,
              subpath: itemSubpath,
              rawItem: item,
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
}
