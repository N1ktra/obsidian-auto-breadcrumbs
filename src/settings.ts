import { App, PluginSettingTab, SettingDefinition } from 'obsidian';
import type AutoBreadcrumbsPlugin from './main';

export class AutoBreadcrumbsSettingTab extends PluginSettingTab {
  plugin: AutoBreadcrumbsPlugin;

  constructor(app: App, plugin: AutoBreadcrumbsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinition[] {
    return [
      {
        name: 'Show bookmarks button',
        desc: 'Displays a compact bookmark button for quick access to your bookmarked notes (dropdown on desktop, native sheet on mobile).',
        control: {
          type: 'toggle',
          key: 'showBookmarks',
        },
      },
      {
        name: 'Mobile navigation button',
        desc: 'Choose how the parent folder navigation button is displayed on mobile.',
        control: {
          type: 'dropdown',
          key: 'mobilePathAction',
          options: {
            'folder-up': 'Up button with folder icon (folder-up)',
            'arrow-up': 'Up button with arrow icon (arrow-up)',
            'parent-name': 'Immediate parent name (compact chip)',
          },
        },
      },
      {
        name: 'Desktop path display mode',
        desc: 'Choose whether to display only folders that have a matching clickable note, or the full folder path on desktop.',
        control: {
          type: 'dropdown',
          key: 'filterMode',
          options: {
            'clickable': 'Show clickable folders only (default)',
            'all': 'Always show full path',
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
      {
        name: 'Breadcrumb label',
        desc: 'Choose whether breadcrumbs display the names of matching notes or folder names.',
        control: {
          type: 'dropdown',
          key: 'labelMode',
          options: {
            'file': 'Matching file name (default)',
            'folder': 'Folder name',
          },
        },
      },

    ];
  }
}
