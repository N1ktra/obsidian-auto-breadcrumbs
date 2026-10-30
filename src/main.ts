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
        if (!leaf || !this.renderer.isMainAreaLeaf(leaf)) {
          return;
        }
        this.renderer.updateLeaf(leaf);
      })
    );

    // Reagiert verlässlich, wenn eine Datei geöffnet wird (z. B. aus linker Leiste oder Suche)
    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.renderer.updateAllLeaves();
      })
    );

    // Reagiert auf Layout-Änderungen im Hauptarbeitsbereich (z. B. Splits öffnen/schließen)
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.renderer.updateAllLeaves();
      })
    );

    // Reagiert auf Umbenennungen / Verschiebungen von Notizen
    this.registerEvent(
      this.app.vault.on('rename', () => {
        this.renderer.updateAllLeaves(true);
      })
    );

    // Reagiert auf das Löschen von Notizen (z. B. falls Folder Notes gelöscht werden)
    this.registerEvent(
      this.app.vault.on('delete', () => {
        this.renderer.updateAllLeaves(true);
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.renderer.updateAllLeaves();

      // Ein kurzer verzögerter Durchlauf stellt sicher, dass auch verzögert initialisierte Split-Panes erfasst werden
      setTimeout(() => {
        this.renderer.updateAllLeaves();
      }, 300);

      // @ts-expect-error Obsidian private internal plugins API
      const bmPlugin = this.app.internalPlugins?.getPluginById('bookmarks');
      if (bmPlugin?.instance) {
        this.registerEvent(
          bmPlugin.instance.on('changed', () => {
            this.renderer.updateAllLeaves(true);
          })
        );
      }
    });

    // Dropdown bei Klick ins Leere schließen
    this.registerDomEvent(document, 'click', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.auto-bc-bm-wrapper')) {
        document.querySelectorAll('.auto-bc-bm-wrapper').forEach((el) => {
          el.classList.remove('is-open');
          el.classList.remove('is-closed');
          el.querySelector<HTMLElement>('.auto-bc-bm-trigger')?.blur();
        });
      }
    });

    // Verhindert ungewolltes horizontales Verschieben beim Anklicken/Bearbeiten des Dateinamens
    this.registerDomEvent(
      document,
      'scroll',
      (e: Event) => {
        const target = e.target as HTMLElement | null;
        if (target?.classList?.contains('view-header-title-container')) {
          target.scrollLeft = 0;
        }
      },
      true
    );

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
      this.app.workspace.iterateAllLeaves((leaf) => {
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
    this.renderer.updateAllLeaves(true);
  }

  onunload() {
    this.renderer?.removeAll();
    this.renderer?.restoreNativeBreadcrumbs();
  }
}
