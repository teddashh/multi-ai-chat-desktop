# Multi-AI Chat Desktop

[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · **Deutsch**

Eine Frage genügt: Vier angemeldete KI-Websitzungen antworten, prüfen, widersprechen und verfeinern das Ergebnis gemeinsam. **ChatGPT, Claude, Gemini und Grok bleiben die Standardauswahl; Meta AI ist eine experimentelle fünfte Standby-Option in den Einstellungen.** Multi-AI Chat Desktop ist ein Workflow-Hub auf Basis von Tauri 2 – nicht bloß vier nebeneinander angeordnete Chats.

[**Offizielle Website öffnen →**](https://teddashh.github.io/multi-ai-chat-desktop/?lang=de) · [v1.9.1 herunterladen](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.1) · [Alle Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases) · MIT · keine API-Schlüssel · keine Analyse

> Diese App automatisiert die Anbieter-Webseiten, die du bereits verwendest. Änderungen an deren Oberfläche können einen Adapter vorübergehend beeinträchtigen; außerdem können die Bedingungen des jeweiligen Dienstes gelten. Verwende nur Konten und Inhalte, zu deren Nutzung du berechtigt bist. Anmeldung, Abonnement, Alter, Nutzungslimits und Sicherheitsprüfungen werden weder umgangen noch automatisiert gelöst.

> **Projektstatus:** Sechs Presets, fünf zugrunde liegende Workflow-Modi, Snapshot/Replay und die optionale AI-Sister-Gedenkausgabe mit vier Figuren bleiben funktionsgefroren. v1.9.1 enthält fünf Anbieter zur Auswahl, davon immer genau vier aktiv. ChatGPT, Claude, Gemini und Grok bleiben die Standardauswahl; Meta AI ist ein experimenteller optionaler Standby.

## Zuerst installieren

Die aktuelle stabile Version steht auf der [**Downloadseite für v1.9.1**](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.1) bereit.

| Plattform | Download | Hinweis zum ersten Start |
|---|---|---|
| **Windows 10/11 x64** | `x64-setup.exe` oder portable `.zip` | Die Artefakte sind nicht signiert; SmartScreen kann warnen. WebView2 ist normalerweise vorhanden und kann sonst vom Installer geladen werden. |
| **macOS Apple Silicon** | `aarch64.dmg` | Ad-hoc signiert, aber nicht von Apple notarisiert. Es gibt keinen Intel-Build. Beachte beim ersten Start die Schritte unten. |
| **Linux x86_64** | `.AppImage` | Zuerst `chmod +x Multi-AI*.AppImage` ausführen. Ubuntu 22.04 / Debian 12 oder neuer wird empfohlen. |

Öffne beim ersten Start jeden Anbieter-Pane einmal und melde dich direkt auf der echten Anbieterseite an. Zugangsdaten und Cookies bleiben im getrennten lokalen WebView-Profil des jeweiligen Anbieters; Multi-AI Chat Desktop fragt nie nach deinem Passwort.

Beim experimentellen Meta-AI-Pfad hängen Gastzugang oder E-Mail-/Mobilanmeldung davon ab, was Metas Website derzeit anbietet. Erscheint eine Anmeldeseite, wähle **Mobilnummer oder E-Mail**. Facebook- und Instagram-Anmeldung werden nicht eingebettet.

### Erster Start unter macOS

1. Eine vorhandene Kopie von `v1.0.0` entfernen, das aktuelle DMG öffnen und die App nach **Programme** ziehen.
2. Einmal versuchen, die App zu öffnen.
3. Innerhalb etwa einer Stunde **Systemeinstellungen → Datenschutz & Sicherheit** öffnen, zum Bereich „Sicherheit“ scrollen, **Dennoch öffnen** wählen und bestätigen.

Die Ad-hoc-Signatur schützt die Bundle-Integrität und verhindert die falsche Meldung „App ist beschädigt“, die bei `v1.0.0` auftreten konnte. Nur Developer-ID-Signatur plus Notarisierung könnte diese Ausnahme ganz entfernen. Auf verwalteten Macs kann eine Freigabe durch Nutzer gesperrt sein.

Portable Windows-Builds zeigen keine Update-Steuerung in der App. Aktualisiere sie manuell über [GitHub Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest). Installierte Builds können nach einer neuen Version suchen und deren Downloadseite öffnen; die App lädt oder installiert Updates jedoch nicht selbst.

## Neu in v1.9.1

- **Grok-Heavy-Fortsetzungs-Timer.** Stellt Grok die Stop-Kontrolle wieder her und erzeugt weiter, ohne den Zwischentext zu ändern, werden veraltete Ruhe-Timer verworfen; die App wartet erneut auf das Ende der Erzeugung.
- **Optionaler Meta-AI-Standby.** Fünf Auswahlmöglichkeiten, immer genau vier aktiv. Die ursprünglichen vier bleiben Standard; in den Einstellungen kann genau ein Anbieter getauscht werden. Profile bleiben erhalten, Rollen und Ziele werden auf die aktuelle Auswahl repariert.
- **Porträt und Diagnose.** Meta AI hat ein eigenes Porträt. Ereignisprotokoll und Debug-Bundle kennzeichnen es als Meta AI, ohne Prompts oder Antworten zu speichern.
- **Fehlgeschlagene Aktionen wiederholen.** Fehler bei Anmeldung, Reload, Report und Replay können wiederholt werden. Doppelte und veraltete Klicks werden ignoriert.
- **Vorprüfung der aktiven vier.** Workflows prüfen die aktuellen vier, auch wenn ein Standby weiterhin Ready wirkt. Debattenplätze decken Meta ab, sobald es aktiv ist.

Die [Release Notes](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.9.1) beschreiben Änderungen und Grenzen.

## Desktop oder Browser-Erweiterung?

| | **Desktop (dieses Repository)** | [**Browser-Erweiterung**](https://teddashh.github.io/multi-ai-chat/?lang=de) |
|---|---|---|
| Am besten für | Vollständige geführte Workflows, fokussierte Live-Anbieteransicht, lokale Sitzungen, Snapshot/Replay und lokale Textdateien | Leichte Nutzung in Chrome mit vorhandenen Anbieter-Tabs |
| Laufzeit | Tauri-App mit einem getrennten lokalen Profil pro Anbieter | Chrome Side Panel plus normale Browser-Tabs |
| Installation | Release für Windows, Apple-Silicon-macOS oder Linux | [Chrome Web Store](https://chromewebstore.google.com/detail/multi-ai-chat/nomhpmmhkmolkmpkjfeainjoifkipdah), freigegebene Updates automatisch |
| Gemeinsamer Kern | Keine API-Schlüssel, echte angemeldete Anbieterseiten, Zusammenarbeit mehrerer Anbieter | Keine API-Schlüssel, echte angemeldete Anbieterseiten, Zusammenarbeit mehrerer Anbieter |

Wähle Desktop für einen eigenen Arbeitsbereich und den vollständigen lokalen Workflow-Werkzeugkasten. Die Erweiterung passt besser, wenn alles in Chrome bleiben soll.

## Inhalt der Desktopausgabe

- **Eine Frage, koordinierte Antworten.** Sende parallel an ausgewählte Anbieter oder lasse einen strukturierten Workflow Ergebnisse zwischen zugewiesenen Rollen weiterreichen.
- **Zuverlässige Hintergrundautomatisierung.** Nicht fokussierte Provider-Panes arbeiten weiter; abgelehnte direkt aufeinanderfolgende Sendungen werden einmal wiederholt, dauerhafte Fehler klar angezeigt.
- **Gesprächsorientierter Arbeitsbereich.** Das Transkript kann das gesamte Fenster nutzen, während Provider-Chips die echte Seite und aktuelle Leseposition erkennbar halten.
- **Sechs Presets, fünf stabile Modi.** Frei, Debatte, Beratung, Coding, Rundtisch sowie das zusätzliche Brainstorming-Preset auf der eingefrorenen Workflow-Laufzeit.
- **Konfigurierbare Rollen.** Standardbelegungen mit vier Rollen verwenden ChatGPT, Claude, Gemini und Grok jeweils einmal. Serielle Rollen dürfen einen Anbieter wiederverwenden; parallel laufende Rollen müssen getrennt bleiben.
- **Optionaler Meta-AI-Standby.** In den Einstellungen kann genau ein Standardanbieter ersetzt werden. Profile bleiben erhalten; Rollen und Ziele werden auf die aktiven vier repariert.
- **Lokale Fortsetzung.** Beginne ein leeres Gespräch oder öffne bis zu 30 ausschließlich lokal gespeicherte Transkripte. Fortsetzungen erhalten begrenzten Kontext nur aus derselben Sitzung.
- **Lesbare, getreue Ausgabe.** Sicheres semantisches Markdown bewahrt Überschriften, verschachtelte Listen, Links, Zitate, fenced code, mathematischen Quelltext und horizontal scrollbar Tabellen. Auch reine ChatGPT-Bildantworten können abgeschlossen werden.
- **Reproduzierbare Arbeit.** Optionale Snapshots mit den eingefrorenen Datenschutzstufen, Replay, Checkpoints, Markdown-Export, Anbieterdialognostik und ein dedupliziertes In-Memory-Log mit 2.000 Ereignissen bleiben verfügbar.
- **Getrennte Oberflächen- und Antwortsprache.** Die UI unterstützt English, 繁體中文, 日本語 und Deutsch. Automatik folgt zuerst einer ausdrücklichen Vorgabe, dann Frage und Gespräch; die UI-Sprache ist nur der letzte Rückfall.
- **AI-Sister-Gedenkausgabe.** Das optionale Theme mit vier Figuren dekoriert ausschließlich app-eigene Oberflächen und verändert keine Anbieterseite.
- **Agent-ready Quellstart.** Explizite Repository-Skills für Codex und Claude Code prüfen Voraussetzungen und starten die lokale Quell-App, ohne einen Installer zu bauen.

## Workflows

| Preset | Ablauf | Geeignet für |
|---|---|---|
| **Frei** | Ausgewählte KIs antworten parallel | Schneller Vergleich und Bild-Prompts |
| **Debatte** | Pro → Contra → Urteil → Synthese | Entscheidungen und Argumente einem Stresstest unterziehen |
| **Beratung** | Zwei unabhängige Antworten → Prüfung → Endergebnis | Recherche und zweite Meinung |
| **Coding** | Spezifikation → Reviews → v1 → Tests → v2 → Abnahme → Final | Strukturierte Softwareplanung und Prüfung |
| **Rundtisch** | 5 Runden × 4 Sitze = 20 Beiträge | Schwierige Fragen langsam und kontrovers zusammenführen |
| **Brainstorming** | 12 Runden × 4 wechselnde Sitze = 48 Beiträge in fünf Phasen | Ideenentwicklung mit vollständigem Kontext, ausgewogenes Portfolio und konkrete Experimente |

Strukturierte Workflows prüfen vorab jede notwendige Rolle. Ist ein Anbieter nicht verfügbar, benennt die App ihn und bietet Öffnen/Anmelden, Neuzuordnung oder einen anderen Modus an; sie ersetzt Anbieter nie stillschweigend. Normale strukturierte Workflows enden bei einem dauerhaften Anbieterfehler. Brainstorming pausiert dagegen bis zur ausdrücklichen Wahl von Wiederholen, Überspringen oder Abbrechen.

Brainstorming ist absichtlich das schwerste Preset: Halte alle vier standardmäßigen Anbietersitzungen angemeldet und plane etwa **45–90 Minuten** ein. Der Wiederherstellungspfad mit 48 Beiträgen ist automatisiert getestet; v1.9.1 fügt keine neue langsame ChatGPT↔Grok-Übergabe mit echten Konten hinzu.

Nach Abschluss kannst du über den Composer unten dasselbe App-Gespräch fortsetzen. **Neues Gespräch** beginnt mit sauberem Sitzungskontext.

## Datenschutz und Sicherheit

- Keine API-Schlüssel, kein Multi-AI-Chat-Konto, keine Telemetrie, Analyse oder eigener Gesprächsserver.
- Prompts gehen direkt an die ausgewählten Anbieterseiten. Die Anbieter empfangen und verarbeiten sie weiterhin nach ihren eigenen Richtlinien.
- Cookies und Browserprofile jedes Anbieters bleiben in lokalen App-Daten und werden nie in Snapshots oder Diagnosen kopiert.
- Entfernte Provider-Webviews gelten als nicht vertrauenswürdig und erhalten **null Tauri-Berechtigungen**. Nur das gebündelte lokale Control Pane darf App-Befehle aufrufen.
- Optionale Adapter-Updates sind reine JSON-Daten, werden gegen das Schema geprüft und können mitgelieferte Provider-/Login-/SSO-URL-Grenzen nicht erweitern.
- Snapshots sind optional und lokal. Sie verwenden die bestehenden Stufen `metadata-only`, `hashes`, `prompt-text` und `full-local`. Es gibt keinen automatischen Upload vollständiger Gespräche und keinen Freigabekanal.
- Debug-Bundles, Markdown-Exporte und Share/Publish-Aktionen laufen nur nach ausdrücklicher Nutzeraktion. Adapterdiagnosen schließen Seitentext, Eingabewerte, Cookies, Storage sowie URL-Queries und Fragmente aus.

Melde Schwachstellen gemäß [SECURITY.md](./SECURITY.md) privat. Veröffentliche niemals Cookies, Tokens, Kontodaten, Gespräche, Provider-HTML oder lokale Profile in einem öffentlichen Issue. Regressionen der Provider-Automatisierung können nach Prüfung der App-Diagnose über das Formular **Adapter broken** gemeldet werden.

## Bekannte Grenzen und Prüfstatus

- Anbieterseiten können sich unangekündigt ändern. Änderungen an DOM oder Login-Ablauf können automatische Eingabe, Sendung oder Abschlusserkennung vorübergehend stören, bis ein Adapter-Update verfügbar ist.
- Anbieter-Konten, Abos, Kontingente, Regionen, Bedingungen und Sicherheitsprüfungen gelten unverändert; die App automatisiert oder umgeht sie nicht. Claude verlangt eine Anmeldung, Gemini kann bei einer Google-`/sorry`-Sperre Systembrowser-Hinweise benötigen, und Grok-Challenges müssen im Pane manuell gelöst werden.
- Für **Windows x64** gibt es verifizierte Paket-Starts; unsignierte Artefakte können dennoch SmartScreen auslösen.
- **macOS Apple Silicon** ist teilweise geprüft. Das DMG ist ad-hoc signiert, nicht notarisiert. Ein früherer Gerätebericht konnte die App öffnen und ChatGPT, Claude und Gemini anmelden, während Grok bei Cloudflare hängen blieb. Die aktuelle Grok-Wiederherstellung benötigt weiterhin einen Live-Retest auf Apple Silicon. Es gibt kein Intel-Artefakt.
- **Linux x86_64** ist nur durch CI-Paketierung bestätigt; ein neuer realer Startbericht eines Maintainers fehlt.
- Für v1.9.1 wurde kein neuer authentifizierter Meta-, Grok-Heavy↔ChatGPT-Astra- oder VM-Smoke ausgeführt. Frühere Windows-Paketstarts, der frühere Apple-Silicon-Bericht zu ChatGPT-/Claude-/Gemini-Anmeldung (Grok blieb bei Cloudflare) und die Linux-CI-Paketierung bleiben der aktuelle Nachweis. Eine langsame ChatGPT↔Grok-Übergabe mit echten Konten, der Grok-Cloudflare-Challenge-Pfad sowie ein neuer Start- und Anbieter-Login-Smoke auf Apple Silicon wurden nicht manuell wiederholt. Der Grok-Fortsetzungs-Timer-Pfad hat nur automatisierte Abdeckung.
- Gastzugang oder E-Mail-/Mobilanmeldung von Meta AI hängen davon ab, was Metas Website derzeit anbietet. Facebook- und Instagram-Anmeldung werden nicht eingebettet.
- Snapshot/Replay/Checkpoint werden nur in ihrer ausgelieferten Form kompatibel gehalten. Über den experimentellen Meta-AI-Standby hinaus sind für diese funktionsgefrorene Ausgabe weder Marketplace, Graph-Editor, weitere Anbieter, neues Persistenzschema, eingebetteter Terminal-Agent, Telemetrie, Developer-ID-/Notarisierungsprogramm noch Self-Updater geplant.

Die evidenzbasierte [Kompatibilitätsmatrix](./docs/COMPATIBILITY.md) enthält Details. CI und automatisierte Tests werden nie als Beleg dafür dargestellt, dass ein echtes Anbieterkonto oder Desktopgerät benutzt wurde.

## Quellversion mit Codex oder Claude Code starten

Das Öffnen oder Klonen dieses Repositories führt nichts automatisch aus. Der Quellstart führt jedoch den als vertrauenswürdig eingestuften Checkout, JavaScript-Lifecycle-Skripte von Abhängigkeiten sowie Rust-Build-Skripte/Prozedurmakros aus; prüfe das Repository daher zuerst.

Das Repo enthält zwei ausdrücklich aufzurufende lokale Skills:

- Codex: [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md) – `$launch-multi-ai-chat` in einer lokalen Codex-App-, CLI- oder IDE-Task ausführen.
- Claude Code: [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md) – `/launch-multi-ai-chat` in einer lokalen grafischen Claude-Code-Sitzung ausführen.

Die Skills dürfen ausschließlich gesperrte Projektabhängigkeiten installieren, generierten Code bauen und `tauri dev` starten. Sie installieren/entfernen keine Host-Toolchains oder globalen Pakete, ändern weder `PATH` noch Sicherheitseinstellungen, bauen keinen Release-Installer, lesen keine Anbieter-Zugangsdaten, laden keine Belege hoch und rollen Host-Änderungen nicht zurück. Remote-/Cloud-Agenten können auf deinem Rechner kein GUI anzeigen. Einen Docker-Pfad gibt es bewusst nicht.

Gemeinsame Voraussetzungen sind **Node.js ^22.13.0 || >=24.0.0**, pnpm/Corepack, stabiles Rust und die [plattformbezogenen Voraussetzungen für Tauri 2](https://v2.tauri.app/start/prerequisites/). Der erste Rust-Build kann mehrere Minuten dauern. Der versionierte Vertrag steht in [`agent-release.json`](./agent-release.json) und [`docs/AGENT-READY-SOURCE-RELEASE.md`](./docs/AGENT-READY-SOURCE-RELEASE.md).

## Entwicklung

```sh
corepack enable # nur wenn pnpm fehlt
pnpm install --frozen-lockfile
pnpm verify
pnpm tauri dev
```

Nützliche Lifecycle-Prüfungen:

```sh
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/stop.mjs --json
```

Nur der identitätsgeprüfte Marker `[MAC_AGENT] READY control-pane` des aktuellen Laufs bedeutet, dass die Quell-App bereit ist. Runtime-Status sowie Vorher-/Nachher-Auditbelege bleiben im gitignorierten Verzeichnis `.agent-runtime/` und werden nicht automatisch hochgeladen. `pnpm tauri build` erstellt Pakete für die aktuelle Plattform.

Lies vor Verhaltensänderungen [Spezifikation](./docs/SPEC.md), [Architektur](./docs/ARCHITECTURE.md), [Release-Leitfaden](./docs/RELEASE.md), [Quellstart-Vertrag](./docs/AGENT-READY-SOURCE-RELEASE.md) und [Beitragsleitfaden](./CONTRIBUTING.md). Adapteränderungen müssen Schema und URL-Grenzen bewahren.

## Projekt und Danksagung

Multi-AI Chat Desktop ist MIT-lizenzierte Software von **Ted Huang / TED-H** ([TED@TED-H.com](mailto:TED@TED-H.com), [ted-h.com](https://ted-h.com)), gesponsert von [AI-Sister.com](https://ai-sister.com). Die Gedenkgrafiken sind mit projektspezifischer Erlaubnis enthalten und werden nicht eigenständig unter der MIT-Softwarelizenz angeboten; siehe [Artwork-Hinweis](./src/assets/themes/ai-sister/NOTICE.md).

Dank an die Mitwirkenden:

- [Rumi-3653](https://github.com/Rumi-3653) steuerte in [#78](https://github.com/teddashh/multi-ai-chat-desktop/pull/78) die Reparatur des ChatGPT-v7-Logged-out-Detektors bei.
- [George Ku (`@ufgeorge`)](https://github.com/ufgeorge) meldete in [#80](https://github.com/teddashh/multi-ai-chat-desktop/issues/80) den durch Anbieterlimits verursachten Brainstorm-Abbruch und führte damit zum Wiederherstellungsablauf in v1.8.6.
- [Dave Tseng (`@DaveTseng2019`)](https://github.com/DaveTseng2019) steuerte die Overlay-Zuverlässigkeitskorrektur in `v1.3.1`, detaillierte Reproduktionen und Vorschläge in [#10](https://github.com/teddashh/multi-ai-chat-desktop/pull/10), [#11](https://github.com/teddashh/multi-ai-chat-desktop/pull/11) und [#12](https://github.com/teddashh/multi-ai-chat-desktop/pull/12), Serializer-Regressionstests in [#14](https://github.com/teddashh/multi-ai-chat-desktop/pull/14), Grok-Challenge-/Fokusarbeit in [#39](https://github.com/teddashh/multi-ai-chat-desktop/pull/39) und [#40](https://github.com/teddashh/multi-ai-chat-desktop/pull/40) sowie das Vollbreiten-Transkript mit scrollgekoppeltem Anbieterfokus in [#51](https://github.com/teddashh/multi-ai-chat-desktop/pull/51) bei.
- [CE Lin (`@ChingEnLin`)](https://github.com/ChingEnLin) lieferte den Anbieterstatus-Bericht in [#41](https://github.com/teddashh/multi-ai-chat-desktop/issues/41) und ChatGPT-, Gemini- und Grok-Adapterkorrekturen in [#42](https://github.com/teddashh/multi-ai-chat-desktop/pull/42).
- Windows- und macOS-Nutzer stellten reproduzierbare Berichte und bereinigte Debug-Logs bereit, die Erststart-Paketierung, Provider-Automatisierung, Sitzungsfortsetzung und Release-Prüfung verbessert haben.

Issues und Pull Requests innerhalb des eingefrorenen Wartungsumfangs sind willkommen. Für reproduzierbare Nicht-Sicherheitsfehler und Wartungsfragen nutze [GitHub Issues](https://github.com/teddashh/multi-ai-chat-desktop/issues).
