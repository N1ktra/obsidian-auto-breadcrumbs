import { App, TFile } from 'obsidian';
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

  getFolderHierarchy(file: TFile): FolderHierarchyItem[] {
    const hierarchy: FolderHierarchyItem[] = [];
    let cur = file.parent;

    while (cur && !cur.isRoot()) {
      hierarchy.unshift({ name: cur.name, path: cur.path, folderObj: cur });
      cur = cur.parent;
    }

    // Avoid duplicate entry if note has the same name as its immediate folder
    const currentClean = this.cleanName(file.basename).toLowerCase();
    if (hierarchy.length > 0) {
      const lastFolderClean = this.cleanName(hierarchy[hierarchy.length - 1].name).toLowerCase();
      if (lastFolderClean === currentClean) {
        hierarchy.pop();
      }
    }

    return hierarchy;
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
}
