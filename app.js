const dropZone = document.querySelector("#dropZone");
const emptyState = document.querySelector("#emptyState");
const reader = document.querySelector("#reader");
const filePicker = document.querySelector("#filePicker");
const sideDrops = [...document.querySelectorAll(".side-drop")];

const slugCounts = new Map();
const referenceLinks = new Map();
const entityDecoder = document.createElement("textarea");

function log(level, event, data = {}) {
  console[level]("[md-reader]", { event, module: "app", ...data });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function decodeEntities(value = "") {
  entityDecoder.innerHTML = String(value);
  return entityDecoder.value;
}

function slugify(text) {
  const base = text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
  const count = slugCounts.get(base) || 0;
  slugCounts.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

function safeHref(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "#";
  if (value.startsWith("#")) return escapeHtml(value);
  try {
    const url = new URL(value, location.href);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? escapeHtml(value) : "#";
  } catch (error) {
    log("warn", "invalid_url", { rawUrl: value, error: error.message });
    return "#";
  }
}

function cleanHeading(text) {
  return text.replace(/\s*\{#[^}]+\}\s*$/, "").replace(/\s+#+\s*$/, "").trim();
}

function inlineMarkdown(text) {
  const keep = [];
  const hold = (html) => {
    keep.push(html);
    return `\u0000${keep.length - 1}\u0000`;
  };

  return escapeHtml(decodeEntities(text))
    .replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, "$1")
    .replace(/&lt;br\s*\/?&gt;/gi, () => hold("<br>"))
    .replace(/&lt;a\s+(?:name|id)=&quot;[^&]+&quot;\s*&gt;&lt;\/a&gt;/gi, "")
    .replace(/&lt;(\/?)(kbd|sub|sup|mark)&gt;/gi, "<$1$2>")
    .replace(/&lt;img\b([\s\S]*?)&gt;/gi, (_, attrs) => {
      const src = /src=&quot;([^&]+)&quot;/i.exec(attrs)?.[1] || "";
      const alt = /alt=&quot;([^&]*)&quot;/i.exec(attrs)?.[1] || "";
      return src ? hold(`<img src="${safeHref(src)}" alt="${escapeHtml(alt)}">`) : "";
    })
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, url, title) => {
      const attrs = title ? ` title="${title}"` : "";
      return hold(`<img src="${safeHref(url)}" alt="${escapeHtml(alt)}"${attrs}>`);
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, url, title) => {
      const attrs = title ? ` title="${title}"` : "";
      return hold(`<a href="${safeHref(url)}" target="_blank" rel="noreferrer"${attrs}>${inlineMarkdown(label)}</a>`);
    })
    .replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (_, label, id) => {
      const ref = referenceLinks.get((id || label).toLowerCase());
      return ref ? hold(`<a href="${safeHref(ref)}" target="_blank" rel="noreferrer">${inlineMarkdown(label)}</a>`) : `[${label}]`;
    })
    .replace(/`([^`]+)`/g, (_, code) => hold(`<code>${code}</code>`))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^\w*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^\w_])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, (_, url) => hold(`<a href="${safeHref(url)}" target="_blank" rel="noreferrer">${url}</a>`))
    .replace(/https?:\/\/[^\s<]+/g, (url) => {
      const cleanUrl = url.replace(/[),.;:!?]+$/, "");
      const suffix = url.slice(cleanUrl.length);
      return hold(`<a href="${safeHref(cleanUrl)}" target="_blank" rel="noreferrer">${cleanUrl}</a>${escapeHtml(suffix)}`);
    })
    .replace(/\u0000(\d+)\u0000/g, (_, index) => keep[Number(index)] || "");
}

function splitTableLine(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cell = "";
  let escaped = false;
  for (const char of trimmed) {
    if (escaped) {
      cell += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function isTableDivider(line) {
  const cells = splitTableLine(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()) || cell.trim() === "");
}

function tableAlignments(divider) {
  return splitTableLine(divider).map((cell) => {
    const value = cell.trim();
    if (value.startsWith(":") && value.endsWith(":")) return "center";
    if (value.endsWith(":")) return "right";
    return "left";
  });
}

function renderTable(headers, rows, aligns = []) {
  log("debug", "table_rendered", {
    function: "renderTable",
    headerCount: headers.length,
    rowCount: rows.length,
    hasInlineBreaks: [...headers, ...rows.flat()].some((cell) => /<br\s*\/?>/i.test(cell))
  });
  const th = headers.map((cell, index) => `<th style="text-align:${aligns[index] || "left"}">${inlineMarkdown(cell)}</th>`).join("");
  const body = rows.map((row) => {
    const cols = headers.map((_, index) => `<td style="text-align:${aligns[index] || "left"}">${inlineMarkdown(row[index] || "")}</td>`).join("");
    return `<tr>${cols}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function splitCompactRows(cells, columnCount) {
  const rows = [];
  let row = [];
  for (const cell of cells) {
    if (!cell && row.length) {
      while (row.length < columnCount) row.push("");
      rows.push(row.slice(0, columnCount));
      row = [];
      continue;
    }
    row.push(cell);
    if (row.length === columnCount) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) {
    while (row.length < columnCount) row.push("");
    rows.push(row);
  }
  return rows;
}

function renderCompactTable(line) {
  const cells = splitTableLine(decodeEntities(line)).filter((cell, index, all) => cell || index > 0 && index < all.length - 1);
  const dividerIndex = cells.findIndex((cell) => /^:?\s*-{1,}\s*:?$/.test(cell.trim()));
  if (dividerIndex <= 0) return "";

  const headers = cells.slice(0, dividerIndex).filter(Boolean);
  const dividerEnd = dividerIndex + headers.length;
  const body = cells.slice(dividerEnd).filter((cell) => !/^:?\s*-{1,}\s*:?$/.test(cell.trim()));
  if (!headers.length || !body.length) return "";

  const rows = splitCompactRows(body, headers.length);
  return renderTable(headers, rows);
}

function parseTableContinuation(line, columnCount, headers = []) {
  if (!line.includes("|")) return null;
  const cells = splitTableLine(decodeEntities(line));
  const hasCompactRowSeparator = /\|\s*\|/.test(line);
  if (!hasCompactRowSeparator && cells.length !== columnCount) return null;
  const firstRow = [];
  let offset = 0;

  while (offset < cells.length && cells[offset] && firstRow.length < columnCount - 1) {
    firstRow.push(cells[offset]);
    offset += 1;
  }
  const continuationLooksLikeRow = firstRow.length === columnCount - 1
    && headers.length === columnCount
    && /description/i.test(headers[columnCount - 1] || "");
  if (continuationLooksLikeRow) firstRow.unshift("");
  while (offset < cells.length && !cells[offset]) offset += 1;

  const rows = splitCompactRows(cells.slice(offset), columnCount);
  if (firstRow.length === columnCount && rows.length) {
    return { continuation: "", rows: [firstRow, ...rows] };
  }
  if (firstRow.length && rows.length) {
    return { continuation: firstRow.join("<br>"), rows };
  }
  if (rows.length) return { continuation: "", rows };
  return firstRow.length ? { continuation: firstRow.join("<br>"), rows: [] } : null;
}

function renderList(lines) {
  const firstOrdered = /^\s*\d+\.\s+/.test(lines[0]);
  const tag = firstOrdered ? "ol" : "ul";
  const items = lines.map((line) => {
    const match = /^\s*(?:[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?(.+)$/.exec(line);
    if (!match) return "";
    const checked = match[1] ? /x/i.test(match[1]) : null;
    const checkbox = checked === null ? "" : `<input type="checkbox" disabled${checked ? " checked" : ""}> `;
    return `<li>${checkbox}${inlineMarkdown(match[2])}</li>`;
  }).join("");
  return `<${tag}>${items}</${tag}>`;
}

function renderBlockquote(lines) {
  const quote = lines.map((line) => line.replace(/^\s*>\s?/, "")).join("\n");
  return `<blockquote>${renderBlocks(quote, false)}</blockquote>`;
}

function stripFrontMatter(markdown) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) return { markdown, frontMatter: "" };
  return { markdown: normalized.slice(match[0].length), frontMatter: match[1] };
}

function stripLeadingMetadata(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  let removed = 0;
  const metadataKeys = new Set([
    "name",
    "description",
    "version",
    "license",
    "author",
    "tags",
    "category"
  ]);
  while (index < lines.length) {
    const key = /^\s*([A-Za-z][\w-]*):\s*.*$/.exec(lines[index])?.[1]?.toLowerCase();
    if (!key || !metadataKeys.has(key)) break;
    index += 1;
    removed += 1;
  }
  while (index < lines.length && !lines[index].trim()) index += 1;
  if (removed) log("debug", "leading_metadata_ignored", { lineCount: removed });
  return lines.slice(index).join("\n");
}

function stripSkillMetadataBeforeContent(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const firstHeading = lines.findIndex((line) => /^#{1,6}\s+/.test(line));
  if (firstHeading <= 0) return markdown;

  const before = lines.slice(0, firstHeading);
  const hasOnlyMetadata = before.every((line) => {
    return !line.trim()
      || /^\s*(name|description|version|license|author|tags|category):\s*/i.test(line)
      || /^\s{2,}\S/.test(line);
  });
  if (!hasOnlyMetadata) return markdown;

  log("debug", "pre_heading_metadata_ignored", { lineCount: firstHeading });
  return lines.slice(firstHeading).join("\n");
}

function stripReferenceLinks(markdown) {
  referenceLinks.clear();
  return markdown.replace(/^\s*\[([^\]]+)]:\s+(\S+)(?:\s+.+)?\s*$/gm, (_, id, url) => {
    referenceLinks.set(id.toLowerCase(), url);
    return "";
  });
}

function renderBlocks(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  const headings = [];
  let paragraph = [];
  let tableCount = 0;
  let codeBlockCount = 0;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    const compactTable = text.includes("|") ? renderCompactTable(text) : "";
    html.push(compactTable || `<p>${inlineMarkdown(text)}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const fence = /^(```+|~~~+)\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      closeParagraph();
      const marker = fence[1][0];
      const lang = fence[2] ? ` data-lang="${escapeHtml(fence[2])}"` : "";
      const code = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^${marker}{3,}\\s*$`).test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      codeBlockCount += 1;
      html.push(`<pre${lang}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^( {4}|\t)/.test(line)) {
      closeParagraph();
      const code = [];
      while (index < lines.length && (/^( {4}|\t)/.test(lines[index]) || !lines[index].trim())) {
        code.push(lines[index].replace(/^( {4}|\t)/, ""));
        index += 1;
      }
      index -= 1;
      codeBlockCount += 1;
      html.push(`<pre><code>${escapeHtml(code.join("\n").trimEnd())}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      closeParagraph();
      continue;
    }

    if (/^\s*<br\s*\/?>\s*$/i.test(line)) {
      closeParagraph();
      log("debug", "standalone_html_break_ignored", { function: "renderBlocks", lineNumber: index + 1 });
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeParagraph();
      const text = cleanHeading(heading[2]);
      const level = heading[1].length;
      const id = slugify(text);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    if (index + 1 < lines.length && /^(=+|-+)\s*$/.test(lines[index + 1]) && line.trim() && !line.includes("|")) {
      closeParagraph();
      const level = lines[index + 1].trim().startsWith("=") ? 1 : 2;
      const text = cleanHeading(line);
      const id = slugify(text);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(([-*_])\s*){3,}$/.test(line)) {
      closeParagraph();
      html.push("<hr>");
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      closeParagraph();
      const quote = [];
      while (index < lines.length && (/^\s*>\s?/.test(lines[index]) || !lines[index].trim())) {
        quote.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(renderBlockquote(quote));
      continue;
    }

    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      closeParagraph();
      const list = [];
      while (index < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[index])) {
        list.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(renderList(list));
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
      closeParagraph();
      const headers = splitTableLine(line);
      const aligns = tableAlignments(lines[index + 1]);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const row = splitTableLine(lines[index]);
        if (row.length !== headers.length) {
          const continuation = parseTableContinuation(lines[index], headers.length, headers);
          if (!continuation) break;
          if (continuation.continuation && rows.length) {
            const lastRow = rows[rows.length - 1];
            lastRow[headers.length - 1] = `${lastRow[headers.length - 1] || ""}<br>${continuation.continuation}`;
          }
          rows.push(...continuation.rows);
          index += 1;
          continue;
        }
        rows.push(row);
        index += 1;
      }
      while (index < lines.length && !lines[index].trim() && index + 1 < lines.length && lines[index + 1].includes("||")) {
        const continuation = parseTableContinuation(lines[index + 1], headers.length, headers);
        if (!continuation) break;
        if (continuation.continuation && rows.length) {
          const lastRow = rows[rows.length - 1];
          lastRow[headers.length - 1] = `${lastRow[headers.length - 1] || ""}<br>${continuation.continuation}`;
        }
        rows.push(...continuation.rows);
        index += 2;
      }
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        const continuation = parseTableContinuation(lines[index], headers.length, headers);
        if (!continuation) break;
        if (continuation.continuation && rows.length) {
          const lastRow = rows[rows.length - 1];
          lastRow[headers.length - 1] = `${lastRow[headers.length - 1] || ""}<br>${continuation.continuation}`;
        }
        rows.push(...continuation.rows);
        index += 1;
      }
      index -= 1;
      tableCount += 1;
      html.push(renderTable(headers, rows, aligns));
      continue;
    }

    if (line.includes("|")) {
      const compactTable = renderCompactTable(line);
      if (compactTable) {
        closeParagraph();
        tableCount += 1;
        html.push(compactTable);
        continue;
      }
    }

    paragraph.push(line.trim());
  }

  closeParagraph();
  log("debug", "markdown_rendered", { lineCount: lines.length, headingCount: headings.length, tableCount, codeBlockCount });
  return html.join("\n");
}

function renderMarkdown(markdown) {
  slugCounts.clear();
  const stripped = stripFrontMatter(markdown);
  if (stripped.frontMatter) log("debug", "front_matter_ignored", { charCount: stripped.frontMatter.length });
  return renderBlocks(stripReferenceLinks(stripSkillMetadataBeforeContent(stripLeadingMetadata(stripped.markdown))));
}

function isMarkdownFile(file) {
  return /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|mdtext)$/i.test(file.name) || /^text\/x?-?markdown$/i.test(file.type || "");
}

async function openMarkdownFile(file) {
  log("info", "file_input", { name: file.name, size: file.size, type: file.type });
  if (!isMarkdownFile(file)) {
    log("warn", "file_rejected", { name: file.name, reason: "not_md_extension" });
    dropZone.classList.add("reading");
    reader.hidden = false;
    emptyState.hidden = true;
    reader.innerHTML = `<p>Drop an MD file. Received: <code>${escapeHtml(file.name)}</code></p>`;
    return;
  }

  try {
    const markdown = await file.text();
    log("debug", "file_read", { name: file.name, charCount: markdown.length });
    reader.innerHTML = renderMarkdown(markdown);
    dropZone.classList.add("reading");
    emptyState.hidden = true;
    reader.hidden = false;
    document.title = file.name;
    window.scrollTo({ top: 0, behavior: "instant" });
    log("info", "file_rendered", { name: file.name });
  } catch (error) {
    log("error", "file_render_failed", { name: file.name, error: error.message });
    dropZone.classList.add("reading");
    reader.hidden = false;
    emptyState.hidden = true;
    reader.innerHTML = `<p>Could not read <code>${escapeHtml(file.name)}</code>.</p>`;
  }
}

function handleDroppedFiles(files) {
  const file = files?.[0];
  log("info", "drop", { fileCount: files?.length || 0, hasFile: Boolean(file) });
  if (file) openMarkdownFile(file);
}

dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
  log("debug", "drag_enter", { itemCount: event.dataTransfer.items.length });
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
  log("debug", "drag_leave");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  handleDroppedFiles(event.dataTransfer.files);
});

for (const sideDrop of sideDrops) {
  sideDrop.addEventListener("click", () => {
    filePicker.click();
  });

  sideDrop.addEventListener("dragenter", (event) => {
    event.preventDefault();
    event.stopPropagation();
    sideDrop.classList.add("dragging");
  });

  sideDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  sideDrop.addEventListener("dragleave", (event) => {
    event.stopPropagation();
    sideDrop.classList.remove("dragging");
  });

  sideDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    sideDrop.classList.remove("dragging");
    dropZone.classList.remove("dragging");
    handleDroppedFiles(event.dataTransfer.files);
  });
}

filePicker.addEventListener("change", () => {
  handleDroppedFiles(filePicker.files);
  filePicker.value = "";
});

log("info", "ready", { page: "reader" });
