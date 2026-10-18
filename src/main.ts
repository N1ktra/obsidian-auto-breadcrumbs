import { FileView, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
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

    // Reagiert nur bei Fokuswechseln im Hauptarbeitsbereich (ignoriert Seitenleisten komplett)
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
        if (!leaf || leaf.getRoot() !== this.app.workspace.rootSplit) {
          return;
        }
        this.renderer.updateActiveLeaf();
      })
    );

    // Reagiert verlässlich, wenn eine Datei geöffnet wird (z. B. aus linker Leiste oder Suche)
    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.renderer.updateActiveLeaf();
      })
    );

    // Reagiert auf Layout-Änderungen im Hauptarbeitsbereich
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.renderer.updateActiveLeaf();
      })
    );

    // Reagiert auf Umbenennungen / Verschiebungen von Notizen
    this.registerEvent(
      this.app.vault.on('rename', () => {
        this.renderer.updateActiveLeaf();
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.renderer.updateActiveLeaf();
    });

    // Dropdown bei Klick ins Leere schließen
    this.registerDomEvent(document, 'click', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.auto-bc-bm-wrapper')) {
        document.querySelectorAll('.auto-bc-bm-wrapper').forEach((el) => {
          el.classList.remove('is-open');
          el.classList.remove('is-closed');
        });
      }
    });

    // Rechtsklick-Menü auf den Dateinamen in der oberen View-Header-Leiste
    this.registerDomEvent(document, 'contextmenu', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const titleEl = target?.closest('.view-header-title');
      if (!titleEl) return;

      if (
        titleEl.closest(
          '.mod-left-split, .mod-right-split, .workspace-drawer, .mod-sidedock'
        )
      ) {
        return;
      }

      let matchedFile: TFile | null = null;
      this.app.workspace.iterateRootLeaves((leaf) => {
        if (
          !matchedFile &&
          leaf.view instanceof FileView &&
          leaf.view.file &&
          leaf.view.containerEl.contains(titleEl)
        ) {
          matchedFile = leaf.view.file;
        }
      });

      if (matchedFile) {
        e.preventDefault();
        e.stopPropagation();
        this.renderer.showContextMenu(e, matchedFile, (matchedFile as TFile).path);
      }
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await super.saveData(this.settings);
    this.renderer.updateActiveLeaf();
  }

  onunload() {
    this.renderer?.removeAll();
    this.renderer?.restoreNativeBreadcrumbs();
  }
}
