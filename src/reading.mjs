import { createElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

// CommonMark leaves **中文：**正文 literal because the punctuation touches text.
// Repair only otherwise-unparsed emphasis in text nodes; never touch code or
// escaped literals, and keep the original record unchanged.
export function remarkChineseStrong() {
  return (tree, file) => {
    const source = String(file);
    const walk = (parent) => {
      if (!parent.children || ["code", "inlineCode"].includes(parent.type))
        return;
      parent.children = parent.children.flatMap((node) => {
        if (node.type !== "text") {
          walk(node);
          return [node];
        }
        const raw = source.slice(
          node.position?.start.offset,
          node.position?.end.offset,
        );
        if (!node.value.includes("**") || /\\\*/.test(raw)) return [node];
        const result = [];
        let offset = 0;
        for (const match of node.value.matchAll(/\*\*([^*\n]+?)\*\*/g)) {
          if (!/[\p{Script=Han}：，。！？「」“”]/u.test(match[1])) continue;
          if (match.index > offset)
            result.push({
              type: "text",
              value: node.value.slice(offset, match.index),
            });
          result.push({
            type: "strong",
            children: [{ type: "text", value: match[1] }],
          });
          offset = match.index + match[0].length;
        }
        if (!offset) return [node];
        if (offset < node.value.length)
          result.push({ type: "text", value: node.value.slice(offset) });
        return result;
      });
    };
    walk(tree);
  };
}

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkChineseStrong);
function parse(text) {
  return parser.runSync(parser.parse(text || ""), { value: text || "" });
}
function nodeText(node) {
  if (node.type === "html") return "";
  if (node.value !== undefined) return node.value;
  if (node.type === "image") return node.alt || "";
  const separator = ["root", "list", "table", "tableRow"].includes(node.type)
    ? "\n"
    : "";
  return (node.children || []).map(nodeText).join(separator);
}
export function plainText(text) {
  return nodeText(parse(text)).replace(/\s+/g, " ").trim();
}
export function documentHeadings(text) {
  return parse(text)
    .children.filter((n) => n.type === "heading" && n.depth <= 3)
    .map((n) => ({
      title: nodeText(n),
      depth: n.depth,
      offset: n.position.start.offset,
    }));
}

export function jobLabel(app) {
  return [...new Set([app?.company, app?.role].filter(Boolean))].join(" · ");
}
export function recordDate(record) {
  if (!record.imported)
    return (record.updatedAt || record.createdAt || "").slice(0, 10);
  if (record.updatedAt && record.updatedAt !== record.createdAt)
    return record.updatedAt.slice(0, 10);
  const dated = (record.content || "").match(
    /(?:更新时间|登记日期)[：:]?\**[：:]?\s*(20\d{2}-\d{2}(?:-\d{2})?)/,
  )?.[1];
  return dated || record.title?.match(/20\d{2}-\d{2}(?:-\d{2})?/)?.[0] || "";
}
export const newestFirst = (a, b) => recordDate(b).localeCompare(recordDate(a));
const labels = {
  "closed-fail": "未通过",
  "closed-pass": "已结束",
  "closed-withdrawn": "主动结束",
  "closed-cancelled": "岗位取消",
  "waiting-result": "等待结果",
  "needs-verification": "待确认",
  confirmed: "已确认",
  inferred: "推断",
  current: "当前版本",
};
export function statusText(value) {
  return plainText(value).replace(
    /\b(closed-fail|closed-pass|closed-withdrawn|closed-cancelled|waiting-result|needs-verification)\b/g,
    (word) => labels[word],
  );
}

export function localDocumentRoute(href, data) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!/\.(feishu\.cn|larksuite\.com)$/.test(url.hostname)) return null;
  const token = url.pathname.split("/").filter(Boolean).at(-1);
  const match = (d) =>
    d.sourceId === token ||
    d.source?.split(/[?#]/)[0] === url.origin + url.pathname;
  const application = data.applications.find(match);
  if (application) return `/jobs/${application.id}`;
  for (const [collection, route] of [
    ["assets", "assets"],
    ["reviews", "reviews"],
    ["artifacts", "documents"],
  ]) {
    const d = data[collection].find(match);
    if (d)
      return d.kind === "process" && d.applicationId
        ? `/jobs/${d.applicationId}`
        : `/${route}/${d.id}`;
  }
  return null;
}

// Historical maintenance sections remain available as provenance, not in the
// default interview reading flow. Return both parts without deleting content.
export function readingParts(text, title) {
  let body = text || "";
  const first = body.match(/^\s*#\s+([^\n]+)\n?/);
  if (first && plainText(first[1]) === plainText(title || ""))
    body = body.slice(first[0].length);
  const headings = [...body.matchAll(/^(#{1,6})\s+([^\n]+)$/gm)];
  const ranges = [];
  for (let i = 0; i < headings.length; i++) {
    if (
      !/(?:Skill\s*(?:测试|实测)|维护规则|归档原则|旧材料索引|来源与状态|状态新鲜度提醒)/i.test(
        headings[i][2],
      )
    )
      continue;
    if (
      ranges.some((r) => headings[i].index >= r[0] && headings[i].index < r[1])
    )
      continue;
    const next = headings
      .slice(i + 1)
      .find((h) => h[1].length <= headings[i][1].length);
    ranges.push([headings[i].index, next?.index ?? body.length]);
  }
  const notes = ranges.map(([a, b]) => body.slice(a, b));
  for (const [a, b] of [...ranges].reverse())
    body = body.slice(0, a) + body.slice(b);
  return { body: body.trim(), notes: notes.join("\n\n") };
}

export function ReadingText({
  text,
  inline = false,
  resolveLink,
  onNavigate,
  components = {},
}) {
  const a = ({ children, href }) => {
    const route = resolveLink?.(href);
    return createElement(
      "a",
      {
        href: route || href,
        target: route || href?.startsWith("#") ? undefined : "_blank",
        rel: route ? undefined : "noreferrer",
        onClick: route
          ? (e) => {
              if (
                !e.metaKey &&
                !e.ctrlKey &&
                !e.shiftKey &&
                !e.altKey &&
                e.button === 0
              ) {
                e.preventDefault();
                onNavigate?.(route);
              }
            }
          : undefined,
      },
      children,
    );
  };
  const inlineComponents = {
    p: ({ children }) => createElement("span", null, children),
  };
  return createElement(
    inline ? "span" : "div",
    { className: inline ? "reading-inline" : "markdown" },
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkChineseStrong],
        components: {
          a,
          img: () => null,
          code: ({ children, ...props }) => {
            const label = labels[String(children)];
            return label
              ? createElement("span", null, label)
              : createElement("code", { className: props.className }, children);
          },
          ...(inline ? inlineComponents : {}),
          ...components,
        },
      },
      text || "",
    ),
  );
}
