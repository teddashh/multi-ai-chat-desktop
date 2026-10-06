/* Flow diagrams for the project-page kit.
   Reads each figure.fd, draws an aria-hidden schematic above its legend, and
   cycles one status line at a time. Layout uses a width estimate, never measured
   text, so a figure hidden by a language switch still lays out. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root) return;
  root.TedFlow = { render: api.render, renderAll: api.renderAll };
  function boot() { api.renderAll(root.document); }
  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var VIEW = 960, PAD = 20, TOP = 28, GUTTER_MIN = 64;
  var CAP = { core: 308, node: 232, lane: 188 };
  var WEIGHT = { core: 1.4, node: 1, lane: 0.86 };
  var LABEL = 15, LABEL_LINE = 20, CORE_LABEL = 17, CORE_LINE = 22, NOTE = 12.5, NOTE_LINE = 17;
  var ROW_GAP = 18, LANE_H = 34, LANE_GAP = 12;
  var TICK_SIZE = 12.5;

  /* Fade fully out, then a short gap, then the next line fades in. */
  var STATUS = { fade: 280, hold: 1760, out: 280, gap: 160 };

  var WIDE = /[ᄀ-ᅟ⺀-〿぀-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
  var NO_LINE_START = /^[、。，．,.：:；;？?！!‥…・ー〜～%％）〕］｝〉》」』】〙〗｣»ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々ゝゞヽヾ]/u;

  var ICONS = {
    chat: '<path d="M5 5.2h14.2v9.2H9.4L5.4 18v-3.6H5z"/><path d="M8.2 8.8h8M8.2 11.6h5.2"/>',
    route: '<circle cx="6" cy="16.2" r="2.1"/><circle cx="17.6" cy="6.4" r="2.1"/><circle cx="17.6" cy="17.2" r="2.1"/><path d="M8 15.2 15.4 7.6M8.2 16.8l7.2.2"/>',
    spark: '<path d="M12 2.6 13.4 8l5.6.8-4.4 3.6 1.5 5.4L12 15.2 8 17.8l1.4-5.4L5 8.8 10.6 8z"/>',
    shield: '<path d="M12 3.2 18.8 6v5.8c0 3.6-2.6 6.4-6.8 8.2C7.8 18.2 5.2 15.4 5.2 11.8V6z"/><path d="m8.8 11.4 2.2 2.2 4.2-4.4"/>',
    mask: '<rect x="3.4" y="7.6" width="17.2" height="8.6" rx="1.6"/><path d="M7.2 10.2v3.4M10.6 10.2v3.4M14 10.2v3.4M17.4 10.2v3.4"/>',
    cloud: '<path d="M7.6 17.4h8.4a3.5 3.5 0 0 0 .4-7 4.8 4.8 0 0 0-9.2-.4 3.3 3.3 0 0 0 .4 7.4z"/>',
    check: '<circle cx="12" cy="12" r="8"/><path d="m8.3 12.2 2.5 2.5 4.8-5.1"/>',
    ledger: '<path d="M7.2 3.8h9.4A1.6 1.6 0 0 1 18.2 5.4v13.2a1.6 1.6 0 0 1-1.6 1.6H7.2z"/><path d="M7.2 3.8v16.4M10.2 8.2h5M10.2 11.6h5M10.2 15h3.2"/>',
    search: '<circle cx="10.8" cy="10.8" r="5.6"/><path d="m15 15 4.2 4.2"/>',
    people: '<circle cx="9" cy="8.2" r="2.6"/><path d="M4.2 18.6c.7-2.8 2.6-4.2 4.8-4.2s4.1 1.4 4.8 4.2"/><path d="M15.6 6.4a2.5 2.5 0 0 1 0 4.8M16.6 14.2c1.6.4 2.8 1.8 3.2 4.4"/>',
    pool: '<path d="M4.2 8.4c2.2-1.4 4.8-2.2 7.8-2.2s5.6.8 7.8 2.2v6.6c-2.2 1.4-4.8 2.2-7.8 2.2s-5.6-.8-7.8-2.2z"/><path d="M4.2 11.8c2.2 1.2 4.8 1.8 7.8 1.8s5.6-.6 7.8-1.8"/>',
    clock: '<circle cx="12" cy="12" r="7.8"/><path d="M12 7.6V12l3.2 2"/>',
    forward: '<path d="M3.6 12h12.6"/><path d="m12.4 7.6 4.6 4.4-4.6 4.4"/><path d="M19.4 7.4v9.2"/>',
    window: '<rect x="3.8" y="4.8" width="16.4" height="14.2" rx="1.6"/><path d="M3.8 9h16.4M6.6 7h.01M9.2 7h.01"/>',
    database: '<ellipse cx="12" cy="7" rx="6.6" ry="2.6"/><path d="M5.4 7v9.4c0 1.5 3 2.6 6.6 2.6s6.6-1.1 6.6-2.6V7"/><path d="M5.4 11.8c0 1.5 3 2.6 6.6 2.6s6.6-1.1 6.6-2.6"/>',
    hub: '<circle cx="12" cy="12" r="2.8"/><path d="M12 3.8v4M12 16.2v4M3.8 12h4M16.2 12h4"/>',
    wallet: '<rect x="3.6" y="6.4" width="16.8" height="11.2" rx="1.8"/><path d="M3.6 10.2h16.8"/><circle cx="15.8" cy="13.6" r="1.1"/>',
    code: '<path d="m9 7-4 5 4 5"/><path d="m15 7 4 5-4 5"/>',
    terminal: '<rect x="4" y="5.2" width="16" height="13.6" rx="1.6"/><path d="m7.6 10 2.6 2-2.6 2M12.2 14.4h4"/>',
    user: '<circle cx="12" cy="8" r="3"/><path d="M5.2 19c.8-3.2 3.2-4.8 6.8-4.8s6 1.6 6.8 4.8"/>',
    gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.6v2.3M12 18.1v2.3M3.6 12h2.3M18.1 12h2.3M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"/>',
    lock: '<path d="M8 10.6V8.2a4 4 0 0 1 8 0v2.4"/><rect x="6" y="10.6" width="12" height="8.4" rx="1.6"/><path d="M12 14v2.2"/>',
    doc: '<path d="M7 3.6h6.8L18 8v12.2H7z"/><path d="M13.6 3.8V8H18M9.4 12h5.2M9.4 15.2h5.2"/>',
    bolt: '<path d="M13 3 6.2 13.2h5L10 21l7.2-10.6h-5z"/>',
    globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4c2.2 2.1 3.4 4.8 3.4 8s-1.2 5.9-3.4 8c-2.2-2.1-3.4-4.8-3.4-8s1.2-5.9 3.4-8z"/>',
    eye: '<path d="M2.8 12S6.4 7.2 12 7.2 21.2 12 21.2 12 17.6 16.8 12 16.8 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.3"/>',
    key: '<circle cx="8.6" cy="12.2" r="3.3"/><path d="M11.6 12.2H20M17.2 12.2v2.3M19.4 12.2v1.6"/>',
    upload: '<path d="M12 16.2V5.4"/><path d="m8 9 4-4 4 4"/><path d="M5 19h14"/>',
    download: '<path d="M12 4.8v10.8"/><path d="m8 12 4 4 4-4"/><path d="M5 19h14"/>',
    bell: '<path d="M6.4 16h11.2l-1.1-1.8V10a4.5 4.5 0 0 0-9 0v4.2z"/><path d="M10 16.2a2 2 0 0 0 4 0"/><path d="M12 3.8v1.6"/>',
    image: '<rect x="4" y="5.2" width="16" height="13.6" rx="1.6"/><path d="m4.6 15 3.8-3.2 3 2.4 2.2-1.8 5.6 4"/><circle cx="9" cy="9.2" r="1.2"/>',
    music: '<path d="M9.4 16.8a2.1 2.1 0 1 1-1.2-1.9"/><path d="M9.2 15.2V6.4l8.2-1.8v8.4"/><path d="M17.4 13.2a2.1 2.1 0 1 1-1.2-1.9"/>',
    game: '<path d="M7 9h10a3.6 3.6 0 0 1 3.6 3.6v.6A3 3 0 0 1 17.6 16h-.8l-1.8-2H9l-1.8 2h-.8A3 3 0 0 1 3.4 13.2v-.6A3.6 3.6 0 0 1 7 9z"/><path d="M8 12.2H6.2M7.1 11.3v1.8M15.6 11.6h.01M17.4 12.8h.01"/>'
  };

  function round(value) { return Math.round(value * 10) / 10; }

  function advance(text, size) {
    var total = 0;
    var glyph;
    for (glyph of String(text)) total += /\s/u.test(glyph) ? size * 0.28 : WIDE.test(glyph) ? size : size * 0.56;
    return total;
  }

  function tokenise(text) {
    var out = [];
    var latin = "";
    var glyph;
    for (glyph of String(text)) {
      if (!WIDE.test(glyph) && !/\s/u.test(glyph)) { latin += glyph; continue; }
      if (latin) { out.push(latin); latin = ""; }
      out.push(glyph);
    }
    if (latin) out.push(latin);
    return out;
  }

  function greedy(tokens, size, budget) {
    var lines = [];
    var line = [];
    var token;
    for (token of tokens) {
      if (!line.length && /\s/u.test(token)) continue;
      if (line.length && advance(line.concat(token).join(""), size) > budget) {
        while (line.length && /\s/u.test(line[line.length - 1])) line.pop();
        if (line.length) lines.push(line);
        line = /\s/u.test(token) ? [] : [token];
        continue;
      }
      line.push(token);
    }
    if (line.length) lines.push(line);
    return lines;
  }

  /* A line must not open with a closing mark. When the mark does not fit on the
     line above, the last glyph of that line comes down with it and the overflow
     spills forward, so the width budget still holds. */
  function wrap(text, size, budget) {
    var lines = greedy(tokenise(text || ""), size, budget);
    var seen = {};
    var guard = 0;
    while (guard < 40) {
      guard += 1;
      var signature = lines.map(function (parts) { return parts.join(""); }).join("\n");
      if (seen[signature]) break;
      seen[signature] = true;
      var index = -1;
      var i;
      for (i = 1; i < lines.length; i += 1) {
        if (lines[i].length && NO_LINE_START.test(lines[i][0]) && lines[i - 1].length >= 2) {
          index = i;
          break;
        }
      }
      if (index < 0) break;
      var carry = lines[index - 1].pop();
      var current = [carry].concat(lines[index]);
      var rest = [];
      while (current.length > 1 && advance(current.join(""), size) > budget) rest.unshift(current.pop());
      lines[index - 1] = lines[index - 1].filter(function (part) { return part.length; });
      lines[index] = current;
      if (!lines[index - 1].length) lines.splice(index - 1, 1);
      if (rest.length) {
        var after = rest.concat(lines.slice(index + 1).reduce(function (all, parts) { return all.concat(parts); }, []));
        lines = lines.slice(0, index + 1).concat(greedy(after, size, budget));
      }
      lines = lines.filter(function (parts) { return parts.length; });
    }
    return lines.length ? lines.map(function (parts) { return parts.join(""); }) : [text || ""];
  }

  function pad2(index) { return String(index + 1).padStart(2, "0"); }

  function centre(box) { return box.y + box.h / 2; }

  function stepBox(index, badge, title, tone, x, w) {
    var fit = w - 32;
    var lines = wrap(title, LABEL, fit);
    var texts = [{ value: pad2(badge), x: x + 16, y: 20, cls: "fd-idx", size: 11, fit: 26 }];
    lines.forEach(function (line, row) {
      texts.push({ value: line, x: x + 16, y: 40 + row * LABEL_LINE, cls: "fd-lbl", size: LABEL, fit: fit });
    });
    return {
      id: "step-" + index, step: index, kind: "step", x: x, y: 0, w: w,
      h: 26 + lines.length * LABEL_LINE + 12, tone: tone || "neutral", selected: false, texts: texts
    };
  }

  function coreBox(index, badge, title, note, tone, x, w, meter) {
    var fit = w - 36;
    var lines = wrap(title, CORE_LABEL, fit);
    var noteLines = wrap(note, NOTE, fit);
    var texts = [{ value: pad2(badge), x: x + 18, y: 26, cls: "fd-idx", size: 11, fit: 26 }];
    var cursor = 52;
    var row;
    for (row = 0; row < lines.length; row += 1) {
      texts.push({ value: lines[row], x: x + 18, y: cursor + row * CORE_LINE, cls: "fd-lbl fd-lbl-core", size: CORE_LABEL, fit: fit });
    }
    cursor += (lines.length - 1) * CORE_LINE + 28;
    for (row = 0; row < noteLines.length; row += 1) {
      texts.push({ value: noteLines[row], x: x + 18, y: cursor + row * NOTE_LINE, cls: "fd-sub", size: NOTE, fit: fit });
    }
    cursor += (noteLines.length - 1) * NOTE_LINE;
    var bar = meter ? { x: x + 18, y: cursor + 14, w: fit } : null;
    return {
      id: "step-" + index, step: index, kind: "core", x: x, y: 0, w: w,
      h: cursor + (meter ? 22 : 0) + 18, tone: tone || "accent", selected: false, texts: texts, meter: bar
    };
  }

  function laneBox(label, selected, x, w, ordinal) {
    return {
      id: "lane-" + ordinal, step: null, kind: "lane", x: x, y: 0, w: w, h: LANE_H,
      tone: selected ? "accent" : "neutral", selected: selected,
      texts: [{ value: label, x: x + w / 2, y: 22, cls: "fd-lane", size: 13, fit: w - 24, middle: true }]
    };
  }

  function lower(box, y) {
    return {
      id: box.id, step: box.step, kind: box.kind, x: box.x, y: y, w: box.w, h: box.h,
      tone: box.tone, selected: box.selected,
      texts: box.texts.map(function (text) {
        return {
          value: text.value, x: text.x, y: text.y + y, cls: text.cls, size: text.size,
          fit: text.fit, middle: text.middle
        };
      }),
      meter: box.meter ? { x: box.meter.x, y: box.meter.y + y, w: box.meter.w } : null
    };
  }

  function connect(from, to) {
    var pairs = from.length === 1 || to.length === 1
      ? from.reduce(function (list, source) {
          return list.concat(to.map(function (target) { return [source, target]; }));
        }, [])
      : from.slice(0, Math.min(from.length, to.length)).map(function (source, index) { return [source, to[index]]; });
    return pairs.map(function (pair) {
      var source = pair[0], target = pair[1];
      var x1 = source.x + source.w, y1 = centre(source), x2 = target.x, y2 = centre(target);
      var bend = (x2 - x1) * 0.5;
      return {
        d: "M" + round(x1) + " " + round(y1) + " C " + round(x1 + bend) + " " + round(y1) + ", " + round(x2 - bend) + " " + round(y2) + ", " + round(x2) + " " + round(y2),
        selected: !!target.selected
      };
    });
  }

  function plan(spec, titles, notes, tones) {
    spec = spec || {};
    titles = titles || [];
    notes = notes || [];
    tones = tones || [];
    var columnsIn = spec.columns || [];
    var sinkSteps = spec.sinks || [];
    var laneNames = spec.lanes || [];
    var groups = columnsIn.map(function (indices) { return { lane: false, indices: indices }; });
    if (laneNames.length) groups.push({ lane: true, indices: [] });
    var weights = groups.map(function (group) {
      if (group.lane) return WEIGHT.lane;
      return group.indices.indexOf(spec.core) >= 0 ? WEIGHT.core : WEIGHT.node;
    });
    var weightSum = weights.reduce(function (total, weight) { return total + weight; }, 0) || 1;
    var gaps = Math.max(groups.length - 1, 0);
    var unit = (VIEW - 2 * PAD - gaps * GUTTER_MIN) / weightSum;
    var widths = weights.map(function (weight, index) {
      var cap = groups[index].lane ? CAP.lane : weight === WEIGHT.core ? CAP.core : CAP.node;
      return Math.min(unit * weight, cap);
    });
    var used = widths.reduce(function (total, width) { return total + width; }, 0);
    var gutter = gaps ? (VIEW - 2 * PAD - used) / gaps : 0;
    var lefts = widths.map(function (_, index) {
      var prior = 0;
      var i;
      for (i = 0; i < index; i += 1) prior += widths[i];
      return PAD + prior + index * gutter;
    });
    var order = columnsIn.reduce(function (list, indices) { return list.concat(indices); }, []).concat(sinkSteps);
    var rank = {};
    order.forEach(function (step, position) { rank[step] = position; });

    var columns = groups.map(function (group, index) {
      if (group.lane) {
        return laneNames.map(function (label, ordinal) {
          return laneBox(label, ordinal === spec.selectedLane, lefts[index], widths[index], ordinal);
        });
      }
      return group.indices.map(function (step) {
        if (step === spec.core) {
          return coreBox(step, rank[step], titles[step], notes[step], tones[step], lefts[index], widths[index], !!spec.meter);
        }
        return stepBox(step, rank[step], titles[step], tones[step], lefts[index], widths[index]);
      });
    });

    function gapOf(group) { return group.lane ? LANE_GAP : ROW_GAP; }
    var stacks = columns.map(function (boxes, index) {
      return boxes.reduce(function (total, box) { return total + box.h; }, 0) + Math.max(boxes.length - 1, 0) * gapOf(groups[index]);
    });
    var draftCore = null;
    columns.forEach(function (boxes) {
      boxes.forEach(function (box) { if (box.kind === "core") draftCore = box; });
    });
    if (!draftCore) throw new Error("flow core is not in a column");
    var haloRx = draftCore.w / 2 + 26;
    var haloRy = draftCore.h / 2 + 26;
    var body = Math.max.apply(null, stacks.concat([haloRy * 2 + 10]));
    var axis = TOP + body / 2;
    var placed = columns.map(function (boxes, index) {
      var cursor = axis - stacks[index] / 2;
      return boxes.map(function (box) {
        var laid = lower(box, cursor);
        cursor += box.h + gapOf(groups[index]);
        return laid;
      });
    });

    var core = null;
    placed.forEach(function (boxes) {
      boxes.forEach(function (box) { if (box.kind === "core") core = box; });
    });
    var wires = [];
    var index;
    for (index = 0; index < placed.length - 1; index += 1) wires = wires.concat(connect(placed[index], placed[index + 1]));

    var edge = null;
    if (spec.boundaryAfter !== undefined && spec.boundaryAfter !== null && gaps) {
      var after = spec.boundaryAfter;
      edge = {
        x: round(lefts[after] + widths[after] + gutter / 2),
        outside: round(lefts[after + 1])
      };
    }

    var coreBottom = core.y + core.h;
    var coreCentre = core.x + core.w / 2;
    var columnsBottom = 0;
    placed.forEach(function (boxes) {
      boxes.forEach(function (box) { columnsBottom = Math.max(columnsBottom, box.y + box.h); });
    });
    var sinkTop = Math.max(coreBottom + 74, columnsBottom + 28);
    var sinkGap = 24;
    var sinkWidth = sinkSteps.length > 1 ? 244 : 268;
    var span = sinkSteps.length * sinkWidth + Math.max(sinkSteps.length - 1, 0) * sinkGap;
    var maxSpan = VIEW - 2 * PAD;
    if (sinkSteps.length && span > maxSpan) {
      sinkWidth = (maxSpan - Math.max(sinkSteps.length - 1, 0) * sinkGap) / sinkSteps.length;
      span = maxSpan;
    }
    var coreColumn = 0;
    columnsIn.forEach(function (indices, column) { if (indices.indexOf(spec.core) >= 0) coreColumn = column; });
    var inside = edge && coreColumn <= spec.boundaryAfter;
    var rightmost = sinkSteps.length
      ? (inside ? Math.min(VIEW - PAD - span, edge.x - span - 14) : VIEW - PAD - span)
      : PAD;
    var sinkLeft = sinkSteps.length ? Math.min(Math.max(coreCentre - span / 2, PAD), Math.max(rightmost, PAD)) : PAD;
    if (sinkSteps.length && sinkLeft + span > VIEW - PAD) sinkLeft = Math.max(PAD, VIEW - PAD - span);
    var sinks = sinkSteps.map(function (step, ordinal) {
      return lower(
        stepBox(step, rank[step], titles[step], tones[step], sinkLeft + ordinal * (sinkWidth + sinkGap), sinkWidth),
        sinkTop
      );
    });
    sinks.forEach(function (sink) {
      var target = sink.x + sink.w / 2;
      wires.push({
        d: "M" + round(coreCentre) + " " + round(coreBottom) + " C " + round(coreCentre) + " " + round(coreBottom + 34) + ", " + round(target) + " " + round(sinkTop - 34) + ", " + round(target) + " " + round(sinkTop),
        selected: false
      });
    });

    var contentBottom = Math.max(TOP + body, 0);
    sinks.forEach(function (sink) { contentBottom = Math.max(contentBottom, sink.y + sink.h); });
    var loopY = null;
    if (spec.loop && placed.length >= 2) {
      var first = placed[0], last = placed[placed.length - 1];
      var x1 = last[0].x + last[0].w / 2;
      var x2 = first[0].x + first[0].w / 2;
      var y1 = 0, y2 = 0, b;
      for (b = 0; b < last.length; b += 1) y1 = Math.max(y1, last[b].y + last[b].h);
      for (b = 0; b < first.length; b += 1) y2 = Math.max(y2, first[b].y + first[b].h);
      loopY = Math.max(contentBottom, y1, y2) + 30;
      wires.push({
        d: "M" + round(x1) + " " + round(y1) + " C " + round(x1) + " " + round((y1 + loopY) / 2) + ", " + round(x1) + " " + round(loopY) + ", " + round(x1) + " " + round(loopY)
          + " L " + round(x2) + " " + round(loopY)
          + " C " + round(x2) + " " + round(loopY) + ", " + round(x2) + " " + round((y2 + loopY) / 2) + ", " + round(x2) + " " + round(y2),
        selected: false
      });
      contentBottom = loopY + 8;
    }

    var tickCount = spec.tickCount == null ? 1 : spec.tickCount;
    var foot = contentBottom;
    var tick = tickCount > 0 ? { x: PAD, y: round(foot + 22), fit: VIEW - 2 * PAD } : null;
    var height = round((tick ? tick.y : foot) + (tick ? 16 : 18));
    var cx = core.x + core.w / 2;
    var cy = core.y + core.h / 2;
    haloRx = Math.min(haloRx, cx - 8, VIEW - cx - 8);
    haloRy = Math.min(haloRy, cy - 8, height - cy - 8);

    return {
      width: VIEW,
      height: height,
      boxes: placed.reduce(function (list, boxes) { return list.concat(boxes); }, []).concat(sinks),
      wires: wires,
      edge: edge,
      halo: { x: round(cx), y: round(cy), rx: round(haloRx), ry: round(Math.max(haloRy, 12)) },
      pulse: { x: round(core.x + core.w), y: round(core.y) },
      tick: tick,
      loopY: loopY
    };
  }

  function statusAt(elapsed, count) {
    var span = STATUS.fade + STATUS.hold + STATUS.out + STATUS.gap;
    if (!count || count < 1) return { index: 0, opacity: 0, span: span, local: 0 };
    if (count === 1) return { index: 0, opacity: 1, span: span, local: 0 };
    var t = Math.floor(elapsed);
    if (t < 0) t = 0;
    t = t % (span * count);
    var index = Math.floor(t / span);
    var local = t % span;
    var opacity = 0;
    if (local < STATUS.fade) opacity = local / STATUS.fade;
    else if (local < STATUS.fade + STATUS.hold) opacity = 1;
    else if (local < STATUS.fade + STATUS.hold + STATUS.out) {
      opacity = 1 - (local - STATUS.fade - STATUS.hold) / STATUS.out;
    }
    return { index: index, opacity: opacity, span: span, local: local };
  }

  function statusVisible(elapsed, count) {
    var frame = statusAt(elapsed, count);
    var out = [];
    var i;
    for (i = 0; i < count; i += 1) out.push(i === frame.index ? frame.opacity : 0);
    return out;
  }

  function el(name, attrs) {
    var node = document.createElementNS(SVGNS, name);
    var key;
    for (key in attrs) if (attrs[key] != null) node.setAttribute(key, String(attrs[key]));
    return node;
  }

  function iconEl(name) {
    var svg = el("svg", { class: "fd-icon", viewBox: "0 0 24 24", width: "24", height: "24", "aria-hidden": "true", focusable: "false" });
    var g = el("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round" });
    g.innerHTML = ICONS[name] || ICONS.hub;
    svg.appendChild(g);
    return svg;
  }

  function textEl(run) {
    var node = el("text", {
      class: run.cls, x: round(run.x), y: round(run.y), "font-size": run.size,
      "text-anchor": run.middle ? "middle" : null
    });
    node.textContent = run.value;
    return node;
  }

  function draw(fig, model) {
    var drawn = model.drawn;
    var svg = el("svg", {
      class: "fd-svg", viewBox: "0 0 " + VIEW + " " + drawn.height,
      preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true", focusable: "false"
    });
    if (drawn.edge && model.zones.length >= 3) {
      var inside = el("text", { class: "fd-zone", x: PAD, y: 16, "font-size": 11 });
      inside.textContent = model.zones[0];
      var outside = el("text", { class: "fd-zone", x: VIEW - PAD, y: 16, "text-anchor": "end", "font-size": 11 });
      outside.textContent = model.zones[2];
      var boundary = el("text", { class: "fd-boundary-label", x: drawn.edge.x, y: 16, "text-anchor": "middle", "font-size": 11 });
      boundary.textContent = model.zones[1];
      svg.appendChild(inside);
      svg.appendChild(outside);
      svg.appendChild(el("path", {
        class: "fd-boundary",
        d: "M" + drawn.edge.x + " 30 L " + drawn.edge.x + " " + round(drawn.loopY ? drawn.loopY - 8 : drawn.height - 8)
      }));
      svg.appendChild(boundary);
    }
    if (drawn.wires.length) {
      svg.appendChild(el("path", { class: "fd-wire", d: drawn.wires.map(function (wire) { return wire.d; }).join(" ") }));
      drawn.wires.forEach(function (wire, ordinal) {
        svg.appendChild(el("path", {
          class: "fd-flow", d: wire.d, "data-delay": String(ordinal % 6),
          "data-selected": wire.selected ? "true" : "false"
        }));
      });
    }
    svg.appendChild(el("ellipse", {
      class: "fd-halo", cx: drawn.halo.x, cy: drawn.halo.y, rx: drawn.halo.rx, ry: drawn.halo.ry
    }));
    drawn.boxes.forEach(function (box) {
      var group = el("g", {
        "data-tone": box.tone, "data-kind": box.kind,
        "data-selected": box.selected ? "true" : "false"
      });
      group.appendChild(el("rect", {
        class: "fd-box", x: round(box.x), y: round(box.y), width: round(box.w), height: round(box.h),
        rx: box.kind === "lane" ? 17 : 13
      }));
      if (box.meter) {
        group.appendChild(el("rect", {
          class: "fd-bar", x: round(box.meter.x), y: round(box.meter.y), width: round(box.meter.w), height: 8, rx: 4
        }));
        group.appendChild(el("rect", {
          class: "fd-bar-fill", x: round(box.meter.x), y: round(box.meter.y), width: round(box.meter.w), height: 8, rx: 4
        }));
      }
      box.texts.forEach(function (run) { group.appendChild(textEl(run)); });
      svg.appendChild(group);
    });
    svg.appendChild(el("circle", { class: "fd-pulse", cx: drawn.pulse.x, cy: drawn.pulse.y, r: 5 }));
    var tick = null;
    if (drawn.tick && model.ticks.length) {
      tick = el("text", { class: "fd-tick", x: drawn.tick.x, y: drawn.tick.y, "font-size": TICK_SIZE });
      tick.textContent = "\u25B2 " + model.ticks[0];
      svg.appendChild(tick);
    }
    var existing = fig.querySelector(":scope > .fd-svg");
    if (existing) existing.remove();
    var legend = fig.querySelector(":scope > .fd-legend");
    fig.insertBefore(svg, legend || fig.firstChild);
    return tick;
  }

  function readModel(fig) {
    var spec = JSON.parse(fig.getAttribute("data-fd") || "{}");
    var titles = [], notes = [], tones = [];
    var items = fig.querySelectorAll(":scope > .fd-legend > .fd-node");
    Array.prototype.forEach.call(items, function (item, domIndex) {
      var index = item.getAttribute("data-step");
      index = index == null || index === "" ? domIndex : Number(index);
      var title = item.querySelector(".fd-title");
      var note = item.querySelector(".fd-note");
      titles[index] = title ? title.textContent.replace(/\s+/g, " ").trim() : "";
      notes[index] = note ? note.textContent.replace(/\s+/g, " ").trim() : "";
      tones[index] = item.getAttribute("data-tone") || "neutral";
      var chip = item.querySelector(".fd-chip");
      if (chip && !chip.querySelector("svg")) chip.appendChild(iconEl(item.getAttribute("data-icon") || "hub"));
    });
    var ticks = Array.prototype.map.call(fig.querySelectorAll(":scope > .fd-ticks > li"), function (item) {
      return item.textContent.replace(/\s+/g, " ").trim();
    });
    var zones = Array.prototype.map.call(fig.querySelectorAll(":scope > .fd-zones > li"), function (item) {
      return item.textContent.replace(/\s+/g, " ").trim();
    });
    spec.tickCount = ticks.length;
    return { spec: spec, titles: titles, notes: notes, tones: tones, ticks: ticks, zones: zones };
  }

  function frozenAt() {
    if (typeof location === "undefined") return null;
    var value = new URLSearchParams(location.search).get("fd-at");
    if (value == null || value === "" || isNaN(Number(value))) return null;
    return Number(value);
  }

  function reducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function driverOf(fig) {
    var svg = fig.querySelector(":scope > .fd-svg");
    var status = fig.querySelector(":scope > .fd-status");
    if (svg && getComputedStyle(svg).display === "none") return status;
    var tick = svg ? svg.querySelector(".fd-tick") : null;
    return tick || status;
  }

  function render(fig) {
    if (!fig || fig.nodeType !== 1 || !fig.getAttribute) return;
    if (fig.__fdLive) return;
    var raw = fig.getAttribute("data-fd");
    if (!raw) return;
    var model;
    try { model = readModel(fig); }
    catch (err) { return; }
    if (!model.spec.columns) return;
    fig.__fdLive = true;
    var drawn;
    try { drawn = plan(model.spec, model.titles, model.notes, model.tones); }
    catch (err) { fig.__fdLive = false; return; }
    model.drawn = drawn;
    var tick = draw(fig, model);
    var status = document.createElement("p");
    status.className = "fd-status";
    status.setAttribute("aria-hidden", "true");
    if (model.ticks.length) status.textContent = "\u25B2 " + model.ticks[0];
    var caption = fig.querySelector(":scope > figcaption");
    if (caption) fig.insertBefore(status, caption);
    else fig.appendChild(status);
    fig.classList.add("is-drawn");
    if (model.ticks.length < 2 || reducedMotion()) fig.classList.add("is-static");

    var index = 0;
    function paint(next) {
      index = next;
      var text = "\u25B2 " + model.ticks[index];
      if (tick) tick.textContent = text;
      status.textContent = text;
    }
    function onIter(event) {
      if (!event || event.animationName !== "fd-tick") return;
      if (event.target !== driverOf(fig)) return;
      paint((index + 1) % model.ticks.length);
    }
    if (tick) tick.addEventListener("animationiteration", onIter);
    status.addEventListener("animationiteration", onIter);

    var hold = frozenAt();
    if (hold != null && model.ticks.length) {
      paint(statusAt(hold, model.ticks.length).index);
      fig.classList.add("is-paused");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!fig.getAnimations) return;
          fig.getAnimations({ subtree: true }).forEach(function (anim) {
            try { anim.currentTime = hold; anim.pause(); } catch (err) { /* seeking is best-effort */ }
          });
        });
      });
    }

    if (hold == null && typeof IntersectionObserver === "function") {
      var io = new IntersectionObserver(function (entries) {
        var hit = entries.some(function (entry) { return entry.isIntersecting; });
        fig.classList.toggle("is-paused", !hit);
      }, { rootMargin: "120px" });
      io.observe(fig);
    }
  }

  function renderAll(scope) {
    var rootNode = scope && scope.querySelectorAll ? scope : document;
    if (!rootNode || !rootNode.querySelectorAll) return;
    if (rootNode.matches && rootNode.matches("figure.fd")) render(rootNode);
    var nodes = rootNode.querySelectorAll("figure.fd");
    var i;
    for (i = 0; i < nodes.length; i += 1) render(nodes[i]);
  }

  return {
    render: render,
    renderAll: renderAll,
    plan: plan,
    wrap: wrap,
    advance: advance,
    tokenise: tokenise,
    statusAt: statusAt,
    statusVisible: statusVisible,
    STATUS: STATUS,
    iconNames: Object.keys(ICONS),
    VIEW: VIEW
  };
});
