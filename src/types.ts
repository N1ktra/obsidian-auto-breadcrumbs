import { TFile, TFolder } from 'obsidian';

export interface AutoBreadcrumbsSettings {
  showBookmarks: boolean;
  positionMode: 'auto' | 'header' | 'editor';
  filterMode: 'auto' | 'all' | 'clickable';
  ignorePrefix: boolean;
  allowedExtensions: string;
  labelMode: 'folder' | 'file';
  mobilePathAction: 'folder-up' | 'arrow-up' | 'parent-name';
}

export const DEFAULT_SETTINGS: AutoBreadcrumbsSettings = {
  showBookmarks: true,
  positionMode: 'header',
  filterMode: 'clickable',
  ignorePrefix: true,
  allowedExtensions: 'md, base, canvas',
  labelMode: 'file',
  mobilePathAction: 'folder-up',
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
