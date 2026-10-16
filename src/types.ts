import { TFile, TFolder } from 'obsidian';

export interface AutoBreadcrumbsSettings {
  showBookmarks: boolean;
  positionMode: 'auto' | 'header' | 'editor';
  filterMode: 'auto' | 'all' | 'clickable';
  ignorePrefix: boolean;
  allowedExtensions: string;
}

export const DEFAULT_SETTINGS: AutoBreadcrumbsSettings = {
  showBookmarks: true,
  positionMode: 'auto',
  filterMode: 'auto',
  ignorePrefix: true,
  allowedExtensions: 'md, base, canvas',
};

export interface FolderHierarchyItem {
  name: string;
  path: string;
  folderObj: TFolder;
  matchedFile: TFile | null;
}

export interface BookmarkItemRef {
  title: string;
  path: string;
  file: TFile;
}
