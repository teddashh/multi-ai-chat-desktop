# Multi-AI Chat Desktop

[English](./README.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · **Deutsch**

Stelle eine Frage und lasse deine angemeldeten Web-Sitzungen von **ChatGPT, Claude, Gemini und Grok** antworten, prüfen, widersprechen und gemeinsam verfeinern. Multi-AI Chat Desktop ist ein Tauri-2-Workflow-Hub – nicht nur vier nebeneinander angeordnete Chats.

**Aktuelle Version: [v1.0.0](https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.0.0)** · MIT · keine API-Schlüssel · keine Analyse

> Das Projekt automatisiert die Webseiten der Anbieter. Änderungen an deren Oberfläche können einen Adapter vorübergehend beschädigen. Beachte die Bedingungen der Anbieter und verwende nur Konten und Inhalte, zu deren Nutzung du berechtigt bist.

> **Projektstatus:** Die Funktionsentwicklung ist abgeschlossen. Das letzte optionale Gedenk-Theme mit allen vier AI-Sister-Figuren ist enthalten; danach werden nur Anbieterkompatibilität, Sicherheit und Build-Probleme gepflegt. Die vorhandenen Snapshot-/Replay-Funktionen bleiben unverändert und werden nicht erweitert.

## Edition wählen

| Edition | Geeignet für | Ausführung |
|---|---|---|
| **Desktop (dieses Repo)** | Vollständige Workflows, Live-Ansicht, Replay, Snapshots, lokale Dateien | Tauri-App mit getrennten lokalen Anbieterprofilen |
| [Browser-Erweiterung](https://github.com/teddashh/multi-ai-chat) | Leichte Nutzung in Chrome | Side Panel steuert vorhandene Anbieter-Tabs |

## Inhalt von v1.0.0

- Zuverlässige Automatisierung im Hintergrund; abgelehnte Sendungen werden erneut versucht oder klar als Fehler gemeldet.
- Workflow-Steuerung links über dem weniger wichtigen WebView; mehr Platz für Transkript und Eingabe rechts.
- Freie Verteilung, Debatte, Beratung, Coding und fünf Runden Wahrheitssuche.
- Bis zu 30 lokale Sitzungen plus **Neuer Chat**.
- Sicher gerendertes Markdown, Abschluss von reinen Bildantworten, Snapshots, Replay und 2.000 Diagnoseereignisse.
- English, 繁體中文, 日本語 und Deutsch.
- Die optionale **AI-Sister Gedenkausgabe** zeigt alle vier Figuren in Anbieterkarten, Sprecherstatus, Prozesszeilen und App-Oberfläche; Drittanbieter-Seiten bleiben unverändert.
- Repo-Skills für Codex und Claude Code starten die Quellversion ohne Installer.

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
- **macOS Apple Silicon:** `aarch64.dmg`. Falls ein unsignierter Build blockiert wird: Rechtsklick → **Öffnen**. Aktuell kein Intel-Build.
- **Linux x64:** `.AppImage`, dann `chmod +x Multi-AI*.AppImage`. Empfohlen: Ubuntu 22.04 / Debian 12 oder neuer.

Beim ersten Start jeden Anbieter einmal öffnen und anmelden. Passwörter werden nur auf der Anbieter-Seite eingegeben; die App fordert sie nicht an.

## Quellversion mit Codex oder Claude Code starten

- Codex Skill: [`.agents/skills/launch-multi-ai-chat/SKILL.md`](./.agents/skills/launch-multi-ai-chat/SKILL.md)
- Claude Code Skill: [`.claude/skills/launch-multi-ai-chat/SKILL.md`](./.claude/skills/launch-multi-ai-chat/SKILL.md)

Die Struktur folgt den offiziellen Formaten für [Codex Agent Skills](https://developers.openai.com/codex/skills) und [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills).

Das Öffnen eines Repos führt aus Sicherheitsgründen keinen Code automatisch aus. Nach einem ausdrücklichen Skill-Aufruf prüft der Agent die Umgebung, installiert bei Bedarf nur JavaScript-Projektabhängigkeiten, baut das injected bundle und startet `tauri dev` im Hintergrund. System-Toolchains und Installer werden nicht heimlich installiert; Anbieter-Zugangsdaten werden nicht gelesen.

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

Allgemein: **Node.js 20+**, pnpm (oder Corepack) und stabiles Rust.

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
node scripts/agent/doctor.mjs
node scripts/agent/launch.mjs
node scripts/agent/status.mjs --lines 80
node scripts/agent/stop.mjs
```

Der erste Rust-Build kann mehrere Minuten dauern. Das Log bleibt unter `.agent-runtime/tauri-dev.log` erhalten.

## Entwicklung

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build:injected
pnpm verify
pnpm tauri dev
```

Vertrag: [`docs/SPEC.md`](./docs/SPEC.md) · Architektur: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · Releases: [`docs/RELEASE.md`](./docs/RELEASE.md)

## Datenschutz

Keine API-Schlüssel, kein Projektkonto, keine Telemetrie und kein eigener Gesprächsserver. Prompts gehen direkt an die ausgewählten Anbieter-Seiten; Cookies und Profile bleiben lokal. Adapter-Updates sind optional. Debug-Bundles, Exporte und Freigaben werden nur nach einer ausdrücklichen Benutzeraktion erstellt.

Sponsored by [AI-Sister.com](https://ai-sister.com). Erstellt von Ted Huang ([TED@TED-H.com](mailto:TED@TED-H.com), [ted-h.com](https://ted-h.com)). MIT License.
