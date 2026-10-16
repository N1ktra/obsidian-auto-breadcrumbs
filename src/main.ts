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
      this.app.workspace.on('active-leaf-change', () => {
        requestAnimationFrame(() => this.renderer.updateActiveLeaf());
      })
    );

    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        requestAnimationFrame(() => this.renderer.updateActiveLeaf());
      })
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        requestAnimationFrame(() => this.renderer.updateActiveLeaf());
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.renderer.updateActiveLeaf();
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

  async saveData(data: any): Promise<void> {
    await super.saveData(data);
    this.renderer.updateActiveLeaf();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    this.renderer?.removeAll();
    this.renderer?.restoreNativeBreadcrumbs();
  }
}
