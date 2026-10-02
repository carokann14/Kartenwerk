import React from 'react';
import { undo, useStore } from '../model/store';
import { saveProjectFile } from '../model/projectIO';
import { Icon } from './common';

/** Fängt Fehler beim Zeichnen eines Bereichs ab, damit nicht die ganze App verschwindet (früher: leerer/schwarzer
 *  Bildschirm). Das Projekt bleibt im Speicher und wird weiter im Browser gesichert; der Bereich zeigt stattdessen
 *  einen Hinweis mit „Erneut versuchen“ und „Letzte Änderung rückgängig“.
 *  `resetKey`: ändert sich der Wert (z. B. andere Auswahl, anderer Schritt, geändertes Dokument), wird automatisch
 *  neu versucht. `full`: Ersatzanzeige für die ganze Seite (oberste Ebene). `onClose`: für Dialoge – Schließen-Knopf. */
interface Props { area: string; resetKey?: unknown; full?: boolean; onClose?: () => void; children: React.ReactNode }
interface State { err: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null };
  static getDerivedStateFromError(err: unknown): State { return { err: err instanceof Error ? err : new Error(String(err)) }; }
  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    console.error(`[Kartenwerk] Fehler im Bereich „${this.props.area}“`, err, info?.componentStack);
  }
  componentDidUpdate(prev: Props) {
    if (this.state.err && !Object.is(prev.resetKey, this.props.resetKey)) this.setState({ err: null });
  }
  private retry = () => this.setState({ err: null });
  private undoAndRetry = () => { undo(); this.setState({ err: null }); };
  render() {
    const { err } = this.state;
    if (!err) return this.props.children;
    const canUndo = useStore.getState().past.length > 0, hasDoc = !!useStore.getState().doc;
    const msg = (err.message || String(err)).slice(0, 240);
    const body = <>
      <div className="err-head"><Icon.warn /><b>{this.props.full ? 'Kartenwerk ist auf einen Fehler gestoßen.' : `„${this.props.area}“ konnte nicht angezeigt werden.`}</b></div>
      <p className="hint">{hasDoc ? 'Dein Projekt ist nicht verloren – es bleibt geöffnet und wird weiter im Browser gesichert.' : 'Es ist ein unerwarteter Fehler aufgetreten.'}</p>
      <details className="err-detail"><summary>Technische Meldung</summary><code>{msg}</code></details>
      <div className="row-btns">
        <button type="button" className="btn small primary" onClick={this.retry}>Erneut versuchen</button>
        {hasDoc && <button type="button" className="btn small" onClick={this.undoAndRetry} disabled={!canUndo}><Icon.undo /> Letzte Änderung rückgängig</button>}
        {this.props.onClose && <button type="button" className="btn small" onClick={() => { this.setState({ err: null }); this.props.onClose!(); }}>Schließen</button>}
        {this.props.full && hasDoc && <button type="button" className="btn small" onClick={() => saveProjectFile()}><Icon.download /> Projektdatei speichern</button>}
        {this.props.full && <button type="button" className="btn small" onClick={() => window.location.reload()}><Icon.refresh /> Seite neu laden</button>}
      </div>
    </>;
    if (this.props.full) return <div className="boot"><div className="err-box err-full" role="alert">{body}</div></div>;
    if (this.props.onClose) return <div className="modal-back"><div className="err-box err-modal" role="alert">{body}</div></div>;
    return <div className="err-box" role="alert">{body}</div>;
  }
}
