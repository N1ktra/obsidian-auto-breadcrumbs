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
            'auto': 'Automatic (Desktop & Tablet: View header, Phone: Note header)',
            'header': 'Always in view header',
            'editor': 'Always below header (in note content)',
          },
        },
      },
      {
        name: 'Path display mode',
        desc: 'Choose whether to display the full folder path or only folders that have a matching clickable note.',
        control: {
          type: 'dropdown',
          key: 'filterMode',
          options: {
            'auto': 'Automatic (Desktop & Tablet: Full path, Phone: Clickable only)',
            'all': 'Always show full path',
            'clickable': 'Always show clickable folders only',
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
        desc: 'Choose whether breadcrumbs display folder names or the names of matching notes.',
        control: {
          type: 'dropdown',
          key: 'labelMode',
          options: {
            'folder': 'Folder name',
            'file': 'Matching file name',
          },
        },
      },

    ];
  }
}
