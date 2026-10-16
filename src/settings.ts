import { App, PluginSettingTab, SettingDefinition } from 'obsidian';
import type AutoBreadcrumbsPlugin from './main';

export interface AutoBreadcrumbsSettings {
  showBookmarks: boolean;
  positionMode: 'auto' | 'header' | 'editor';
  ignorePrefix: boolean;
  allowedExtensions: string;
}

export const DEFAULT_SETTINGS: AutoBreadcrumbsSettings = {
  showBookmarks: true,
  positionMode: 'auto',
  ignorePrefix: true,
  allowedExtensions: 'md, base, canvas',
};

export class AutoBreadcrumbsSettingTab extends PluginSettingTab {
  plugin: AutoBreadcrumbsPlugin;

  constructor(app: App, plugin: AutoBreadcrumbsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Declarative Settings API (Obsidian 1.13.0+)
   * Automatically indexed by Obsidian's native settings search.
   */
  getSettingDefinitions(): SettingDefinition[] {
    return [
      {
        name: 'Show bookmarks dropdown',
        desc: 'Displays a compact bookmark icon on the left with a dropdown list of all your bookmarked notes.',
        control: {
          type: 'toggle',
          key: 'showBookmarks',
        },
      },
      {
        name: 'Breadcrumbs position',
        desc: 'Choose where the navigation bar should be rendered.',
        control: {
          type: 'dropdown',
          key: 'positionMode',
          options: {
            'auto': 'Automatic (Desktop: View header, Mobile: Note header)',
            'header': 'Always in view header',
            'editor': 'Always below header (in note content)',
          },
        },
      },
      {
        name: 'Ignore prefixes & emojis',
        desc: 'Ignores leading emojis, numbering, and symbols when matching folders to notes (e.g., folder "Travel" matches "✈️ Travel.md").',
        control: {
          type: 'toggle',
          key: 'ignorePrefix',
        },
      },
      {
        name: 'Allowed file extensions',
        desc: 'Comma-separated list of recognized file extensions (e.g., "md, base, canvas").',
        control: {
          type: 'text',
          key: 'allowedExtensions',
          placeholder: 'md, base, canvas',
        },
      },
    ];
  }
}
