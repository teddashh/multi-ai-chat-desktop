# Multi-AI Chat Desktop

[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · **Deutsch**

Stelle eine Frage und lasse deine angemeldeten Web-Sitzungen von **ChatGPT, Claude, Gemini und Grok** antworten, prüfen, widersprechen und gemeinsam verfeinern. Multi-AI Chat Desktop ist ein Tauri-2-Workflow-Hub – nicht nur vier nebeneinander angeordnete Chats.

**Aktuelle Version: [neueste stabile Version herunterladen](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest)** · MIT · keine API-Schlüssel · keine Analyse

> Das Projekt automatisiert die Webseiten der Anbieter. Änderungen an deren Oberfläche können einen Adapter vorübergehend beschädigen. Beachte die Bedingungen der Anbieter und verwende nur Konten und Inhalte, zu deren Nutzung du berechtigt bist.

> **Projektstatus:** Die Funktionsentwicklung ist abgeschlossen. Das letzte optionale Gedenk-Theme mit allen vier AI-Sister-Figuren ist enthalten; danach werden nur Anbieterkompatibilität, Sicherheit und Build-Probleme gepflegt. Die vorhandenen Snapshot-/Replay-Funktionen bleiben unverändert und werden nicht erweitert.

## Edition wählen

| Edition | Geeignet für | Ausführung |
|---|---|---|
| **Desktop (dieses Repo)** | Vollständige Workflows, Live-Ansicht, Replay, Snapshots, lokale Dateien | Tauri-App mit getrennten lokalen Anbieterprofilen |
| [Browser-Erweiterung](https://github.com/teddashh/multi-ai-chat) | Leichte Nutzung in Chrome | Side Panel steuert vorhandene Anbieter-Tabs |

## Inhalt der Desktop-Ausgabe

- Zuverlässige Automatisierung im Hintergrund; abgelehnte Sendungen werden erneut versucht oder klar als Fehler gemeldet.
- Workflow-Steuerung links über dem weniger wichtigen WebView; mehr Platz für Transkript und Eingabe rechts.
- Freie Verteilung, Debatte, Beratung, Coding und fünf Runden Wahrheitssuche.
- Bis zu 30 lokale Sitzungen plus **Neuer Chat**.
- Sicher gerendertes Markdown, Abschluss von reinen Bildantworten, Snapshots, Replay und 2.000 Diagnoseereignisse.
- English, 繁體中文, 日本語 und Deutsch.
- Die Antwortsprache ist von der Oberflächensprache getrennt. Automatisch gelten zuerst ausdrückliche Vorgaben, dann Frage und Gespräch; die Oberfläche ist nur der Rückfall. Eine feste Antwortsprache ist ebenfalls wählbar.
- Die optionale **AI-Sister Gedenkausgabe** zeigt alle vier Figuren in Anbieterkarten, Sprecherstatus, Prozesszeilen und App-Oberfläche; Drittanbieter-Seiten bleiben unverändert.
- Repo-Skills für Codex und Claude Code starten die Quellversion ohne Installer.
- Apple-Silicon-DMGs sind ad-hoc signiert; die Release-CI prüft die eingebettete App-Signatur vor dem Upload.

## Workflow-Modi

| Modus | Ablauf | Einsatz |
|---|---|---|
| **Frei** | Ausgewählte KIs antworten parallel | Vergleich, Brainstorming, Bilder |
| **Debatte** | Pro → Contra → Urteil → Synthese | Argumente und Entscheidungen prüfen |
| **Beratung** | Zwei unabhängige Antworten → Prüfung → Ergebnis | Recherche und zweite Meinung |
| **Coding** | Spezifikation → Reviews → v1 → Tests → v2 → Abnahme → Final | Strukturierte Softwareplanung |
| **Rundtisch** | 5 Runden × 4 KIs = 20 Beiträge | Schwierige Fragen kontrovers konvergieren lassen |

Nach einem Workflow kann die Unterhaltung unten rechts fortgesetzt werden. **Neuer Chat** beginnt mit sauberem Kontext.

## Release installieren

Von [Releases](https://github.com/teddashh/multi-ai-chat-desktop/releases/latest) herunterladen:

- **Windows x64:** portable `.zip` oder `x64-setup.exe`. Windows 10/11 enthält WebView2 normalerweise bereits.
- **macOS Apple Silicon:** `aarch64.dmg`. Ab `v1.0.1` ist der Build ad-hoc signiert, aber noch nicht von Apple notarisiert. Aktuell kein Intel-Build.
- **Linux x64:** `.AppImage`, dann `chmod +x Multi-AI*.AppImage`. Empfohlen: Ubuntu 22.04 / Debian 12 oder neuer.

Beim ersten Start jeden Anbieter einmal öffnen und anmelden. Passwörter werden nur auf der Anbieter-Seite eingegeben; die App fordert sie nicht an.

### Erster Start unter macOS

1. Alte Kopien von `v1.0.0` löschen, `v1.0.1` oder neuer laden, das DMG öffnen und die App nach **Programme** ziehen.
2. Einmal versuchen, die App zu öffnen.
3. Innerhalb etwa einer Stunde **Systemeinstellungen → Datenschutz & Sicherheit** öffnen, zum Bereich „Sicherheit“ scrollen und **Dennoch öffnen (Open Anyway)** bestätigen.

Die ad-hoc Signatur verhindert die falsche Meldung, die App sei beschädigt. Nur eine Apple-Developer-ID-Signatur mit Notarisierung kann die Sicherheitsausnahme beim ersten Start vollständig entfernen. Auf verwalteten Macs können solche Ausnahmen gesperrt sein.

## Quellversion mit Codex oder Claude Code starten

- Codex Skill: [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md)
- Claude Code Skill: [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md)

Die Struktur folgt den offiziellen Formaten für [Codex Agent Skills](https://developers.openai.com/codex/skills) und [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills).

Die maschinenlesbare Quelle ist [`agent-release.json`](./agent-release.json), validiert durch [`agent-release.schema.json`](./agent-release.schema.json). Vertrauensgrenze, Berechtigungen, Nebenwirkungen, READY-Nachweis und Audits beschreibt der zweisprachige [`Agent-Ready Source Release contract`](./docs/AGENT-READY-SOURCE-RELEASE.md).

Das Öffnen des Repos führt niemals automatisch Code aus. Der Quellstart führt diesen Checkout, JavaScript-Lifecycle-Code aus Abhängigkeiten sowie Rust-Build-Skripte/Prozedurmakros aus; das Repo muss daher vorher geprüft und als vertrauenswürdig eingestuft werden. Der ausdrücklich aufgerufene Skill darf nur locked dependencies dieses Projekts installieren, generated code bauen und `tauri dev` starten. Er installiert oder entfernt keine Host-Toolchains/globalen Pakete, ändert weder `PATH` noch Sicherheitseinstellungen, baut keinen Installer und liest keine Provider-Zugangsdaten. Host-Installationen sind getrennte Vorgänge und benötigen eine eigene ausdrückliche Zustimmung.

### Codex App, CLI oder IDE

1. Repo herunterladen/klonen und als **lokales** Codex-Projekt bzw. lokale Task öffnen.
2. `$launch-multi-ai-chat` eingeben oder in `/skills` **Launch Multi-AI Chat** wählen.
3. Falls erforderlich, lokale Befehlsausführung erlauben.
4. Nach dem ersten Rust-Build öffnet sich das Tauri-Fenster.

Repo-Skills funktionieren in Codex App, CLI und IDE. Eine Remote-/Cloud-Task kann kein GUI-Fenster auf deinem Rechner anzeigen.

### Claude Code Desktop, CLI oder IDE

1. Dieses Repo in einer Claude-Code-Oberfläche mit **lokaler Shell auf deinem grafischen Rechner** öffnen.
2. `/launch-multi-ai-chat` ausführen.
3. Den Repo-Ordner nicht verschieben, solange die Dev-App läuft.

Ist die Desktop-/Browser-Sitzung remote, verwende eine lokale Claude-Code-Sitzung oder starte `claude` in diesem Ordner und rufe anschließend `/launch-multi-ai-chat` auf.

### Voraussetzungen nach Betriebssystem

Allgemein: **Node.js 20+**, pnpm (oder Corepack) und stabiles Rust. Die folgenden Schritte sind manuelle Beispiele; der Skill meldet fehlende Voraussetzungen nur und beendet sich.

**Windows 10/11**

1. Node.js LTS installieren.
2. `winget install --id Rustlang.Rustup` ausführen und MSVC auswählen.
3. **Visual Studio Build Tools → Desktop development with C++** installieren.
4. Microsoft Edge WebView2 Evergreen Runtime nur ergänzen, wenn es fehlt.

**macOS 10.15+**

1. `xcode-select --install` ausführen; für reine Desktop-Entwicklung ist vollständiges Xcode nicht nötig.
2. Node.js LTS und Rust stable installieren.
3. Skill aus einer lokalen grafischen Sitzung, nicht über SSH, starten.

**Ubuntu / Debian**

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Danach Node.js 20+ und Rust stable installieren und den Skill in einer X11-/Wayland-Sitzung ausführen. Andere Distributionen: [Tauri-2-Voraussetzungen](https://v2.tauri.app/start/prerequisites/).

### Skill-Befehle

```sh
node scripts/agent/audit.mjs --phase before --write --json
node scripts/agent/doctor.mjs --json
node scripts/agent/launch.mjs --dry-run --json
node scripts/agent/launch.mjs --wait --timeout-ms 600000 --json
node scripts/agent/status.mjs --json --lines 80
node scripts/agent/audit.mjs --phase after --write --json
node scripts/agent/stop.mjs --json
pnpm agent:verify
```

Der erste Rust-Build kann mehrere Minuten dauern. `accepted`/`building` sind kein READY-Nachweis; nur der Marker `[MAC_AGENT] READY control-pane` des aktuellen Laufs ergibt `state: "ready"`. Log, Prozessidentität sowie Before-/After-Audit-Receipts bleiben ausschließlich im gitignored Verzeichnis `.agent-runtime/` und werden nie automatisch hochgeladen. Für diesen lokalen GUI-/WebView-Pfad gibt es bewusst keine Docker-Variante.

## Entwicklung

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build:injected
pnpm verify
pnpm tauri dev
```

Vertrag: [`docs/SPEC.md`](./docs/SPEC.md) · Architektur: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · Releases: [`docs/RELEASE.md`](./docs/RELEASE.md) · Prüfstatus: [`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md)

## Datenschutz

Keine API-Schlüssel, kein Projektkonto, keine Telemetrie und kein eigener Gesprächsserver. Prompts gehen direkt an die ausgewählten Anbieter-Seiten; Cookies und Profile bleiben lokal. Adapter-Updates sind optionale reine JSON-Daten, werden gegen das Schema geprüft und können die mitgelieferten URL-Grenzen nicht erweitern. Debug-Bundles, Exporte und Freigaben werden nur nach einer ausdrücklichen Benutzeraktion erstellt.

Schwachstellen bitte gemäß [`SECURITY.md`](./SECURITY.md) privat melden. Regressionen der Provider-Automatisierung können nach Prüfung der App-Diagnose über das GitHub-Formular **Adapter broken** gemeldet werden.

Sponsored by [AI-Sister.com](https://ai-sister.com). Erstellt von Ted Huang ([TED@TED-H.com](mailto:TED@TED-H.com), [ted-h.com](https://ted-h.com)). MIT License.
