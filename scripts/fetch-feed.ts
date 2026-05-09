import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const SOURCES_PATH = join(ROOT, "data/feed/sources.json");
const ITEMS_PATH = join(ROOT, "data/feed/items.json");
const TIMEOUT = 10_000;
const MAX_RETRIES = 2;
const MAX_ITEMS = 100;
const MAX_PER_SOURCE = 8;

interface Source {
  name: string;
  type: string;
  category: string;
  lang: string;
  feed_url: string;
  no_feed?: boolean;
  channel_id?: string;
}

interface FeedItem {
  id: string;
  source: string;
  type: string;
  category: string;
  lang: string;
  title: string;
  summary: string;
  thumbnail: string | null;
  url: string;
  published: string;
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s\S*$/, "") + "...";
}

function extractTag(xml: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim();
  }
  return "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["']`, "i"));
  return match ? match[1] : "";
}

function parseAtomEntries(xml: string): Array<{ title: string; url: string; summary: string; published: string; thumbnail: string | null }> {
  const entries: Array<{ title: string; url: string; summary: string; published: string; thumbnail: string | null }> = [];
  const entryBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];

  for (const block of entryBlocks) {
    const title = stripHtml(extractTag(block, "title"));
    const url = extractAttr(block, 'link[^>]*rel="alternate"', "href") || extractAttr(block, "link", "href");
    const summary = truncate(stripHtml(extractTag(block, "summary") || extractTag(block, "content")), 200);
    const published = extractTag(block, "published") || extractTag(block, "updated");

    // YouTube thumbnail
    let thumbnail: string | null = null;
    const videoIdMatch = block.match(/<yt:videoId>([^<]+)/);
    if (videoIdMatch) {
      thumbnail = `https://i.ytimg.com/vi/${videoIdMatch[1]}/mqdefault.jpg`;
    }
    // Media thumbnail
    if (!thumbnail) {
      const mediaThumb = extractAttr(block, "media:thumbnail", "url");
      if (mediaThumb) thumbnail = mediaThumb;
    }

    if (title && url) {
      entries.push({ title, url, summary, published, thumbnail });
    }
  }
  return entries;
}

function parseRssItems(xml: string): Array<{ title: string; url: string; summary: string; published: string; thumbnail: string | null }> {
  const items: Array<{ title: string; url: string; summary: string; published: string; thumbnail: string | null }> = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = stripHtml(extractTag(block, "title"));
    const url = extractTag(block, "link") || extractTag(block, "guid");
    const summary = truncate(stripHtml(extractTag(block, "description") || extractTag(block, "content:encoded")), 200);
    const published = extractTag(block, "pubDate") || extractTag(block, "dc:date");

    let thumbnail: string | null = null;
    const enclosureUrl = extractAttr(block, "enclosure", "url");
    if (enclosureUrl && /\.(jpg|jpeg|png|gif|webp)/i.test(enclosureUrl)) {
      thumbnail = enclosureUrl;
    }
    if (!thumbnail) {
      const mediaContent = extractAttr(block, "media:content", "url");
      if (mediaContent) thumbnail = mediaContent;
    }
    if (!thumbnail) {
      const imgMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) thumbnail = imgMatch[1];
    }

    if (title && url) {
      items.push({ title, url, summary, published, thumbnail });
    }
  }
  return items;
}

function parseFeed(xml: string): Array<{ title: string; url: string; summary: string; published: string; thumbnail: string | null }> {
  if (xml.includes("<feed") && xml.includes("xmlns=\"http://www.w3.org/2005/Atom\"")) {
    return parseAtomEntries(xml);
  }
  if (xml.includes("<feed") && xml.includes("<entry")) {
    return parseAtomEntries(xml);
  }
  if (xml.includes("<rss") || xml.includes("<item>")) {
    return parseRssItems(xml);
  }
  // Try both
  const atom = parseAtomEntries(xml);
  if (atom.length > 0) return atom;
  return parseRssItems(xml);
}

async function fetchWithRetry(url: string, retries: number = MAX_RETRIES): Promise<string | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
          "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
        },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        if (i === retries) return null;
        continue;
      }
      return await res.text();
    } catch {
      if (i === retries) return null;
    }
  }
  return null;
}

async function fetchSource(source: Source): Promise<FeedItem[]> {
  if (source.no_feed || !source.feed_url) return [];

  const xml = await fetchWithRetry(source.feed_url);
  if (!xml) {
    console.error(`  FAIL: ${source.name} (could not fetch)`);
    return [];
  }

  const entries = parseFeed(xml);
  return entries.map((e) => ({
    id: sha1(e.url),
    source: source.name,
    type: source.type,
    category: source.category,
    lang: source.lang,
    title: e.title,
    summary: e.summary,
    thumbnail: e.thumbnail,
    url: e.url,
    published: e.published ? new Date(e.published).toISOString() : new Date().toISOString(),
  }));
}

async function main() {
  console.log("Feed fetcher starting...\n");

  const sources: Source[] = JSON.parse(readFileSync(SOURCES_PATH, "utf-8"));
  const results = await Promise.allSettled(sources.map((s) => fetchSource(s)));

  let allItems: FeedItem[] = [];
  const summary: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const result = results[i];

    if (source.no_feed) {
      summary.push(`  ${source.name}: SKIPPED (no feed)`);
      continue;
    }

    if (result.status === "fulfilled") {
      const items = result.value;
      summary.push(`  ${source.name}: ${items.length} items`);
      allItems.push(...items);
    } else {
      summary.push(`  ${source.name}: ERROR (${result.reason})`);
    }
  }

  // Dedupe by id
  const seen = new Set<string>();
  allItems = allItems.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // Sort by published desc
  allItems.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());

  // Cap per-source so high-volume sources don't crowd out hand-picked ones
  const perSourceCount = new Map<string, number>();
  allItems = allItems.filter((item) => {
    const n = perSourceCount.get(item.source) ?? 0;
    if (n >= MAX_PER_SOURCE) return false;
    perSourceCount.set(item.source, n + 1);
    return true;
  });

  // Cap at MAX_ITEMS
  allItems = allItems.slice(0, MAX_ITEMS);

  writeFileSync(ITEMS_PATH, JSON.stringify(allItems, null, 2));

  console.log("Summary:");
  for (const line of summary) console.log(line);
  console.log(`\nTotal: ${allItems.length} items (capped at ${MAX_ITEMS})`);
  console.log(`Written to: ${ITEMS_PATH}`);
}

main().catch(console.error);
