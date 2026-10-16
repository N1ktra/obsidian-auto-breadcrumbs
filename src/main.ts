import { Plugin } from 'obsidian';
import { AutoBreadcrumbsSettings, DEFAULT_SETTINGS } from './types';
import { AutoBreadcrumbsSettingTab } from './settings';
import { BreadcrumbResolver } from './resolver';
import { BreadcrumbRenderer } from './renderer';

export default class AutoBreadcrumbsPlugin extends Plugin {
  settings: AutoBreadcrumbsSettings = DEFAULT_SETTINGS;
  private resolver!: BreadcrumbResolver;
  private renderer!: BreadcrumbRenderer;

  async onload() {
    await this.loadSettings();

    this.resolver = new BreadcrumbResolver(this.app, () => this.settings);
    this.renderer = new BreadcrumbRenderer(this.app, this.resolver, () => this.settings);

    this.addSettingTab(new AutoBreadcrumbsSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (!file) {
          this.renderer.removeAll();
          return;
        }
        requestAnimationFrame(() => this.renderer.render(file));
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.refreshActiveNote();
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

  /**
   * Called automatically by Obsidian's Declarative Settings API when a setting changes.
   * Overriding saveData ensures the UI re-renders immediately upon toggling options.
   */
  async saveData(data: any): Promise<void> {
    await super.saveData(data);
    this.refreshActiveNote();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private refreshActiveNote() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.renderer.render(activeFile);
    }
  }

  onunload() {
    this.renderer?.removeAll();
    this.renderer?.restoreNativeBreadcrumbs();
  }
}
