#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Read books.json
const booksJson = JSON.parse(fs.readFileSync('/home/wijnandb/sites/wijnandbaretta/static/data/books.json', 'utf8'));

// Create ASIN lookup from JSON
const booksByAsin = {};
booksJson.forEach(book => {
  booksByAsin[book.asin] = book;
});

// Read markdown files and extract metadata
const booksDir = '/home/wijnandb/sites/15-a-day/content/books';
const mdFiles = fs.readdirSync(booksDir).filter(f => f.endsWith('.md'));

const enrichedBooks = [];
const allTags = new Set();

mdFiles.forEach(file => {
  const content = fs.readFileSync(path.join(booksDir, file), 'utf8');

  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return;

  const frontmatter = frontmatterMatch[1];

  // Extract fields
  const titleMatch = frontmatter.match(/title:\s*"([^"]+)"/);
  const asinMatch = frontmatter.match(/ASIN:\s*(\w+)/);
  const tagsMatch = frontmatter.match(/tags:\s*\[([^\]]*)\]/);
  const authorsMatch = frontmatter.match(/authors:\s*\[([^\]]*)\]/);
  const readlinkMatch = frontmatter.match(/readlink:\s*"([^"]+)"/);
  const coverMatch = frontmatter.match(/cover:\s*([^\n]+)/);
  const largecoverMatch = frontmatter.match(/largecover:\s*"([^"]+)"/);

  // Extract summary (content after frontmatter)
  const bodyContent = content.split('---')[2] || '';
  const summaryMatch = bodyContent.match(/## Summary[:\s]*\n([\s\S]*?)(?=\n##|\n###|$)/i);
  const summary = summaryMatch ? summaryMatch[1].trim().substring(0, 500) : '';

  const asin = asinMatch ? asinMatch[1] : null;
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(t => t && t !== 'book')
    : [];

  tags.forEach(t => allTags.add(t));

  // Merge with JSON data or create new entry
  const jsonBook = asin ? booksByAsin[asin] : null;

  const book = {
    title: titleMatch ? titleMatch[1] : (jsonBook?.title || file.replace('.md', '')),
    asin: asin,
    authors: authorsMatch
      ? authorsMatch[1].split(',').map(a => a.trim().replace(/['"]/g, '').replace(/:$/, ''))
      : (jsonBook?.authors?.map(a => a.replace(/:$/, '')) || []),
    tags: tags,
    readlink: readlinkMatch ? readlinkMatch[1] : (jsonBook?.webReaderUrl || ''),
    cover: jsonBook?.productUrl || (largecoverMatch ? largecoverMatch[1] : ''),
    summary: summary,
    resourceType: jsonBook?.resourceType || 'EBOOK'
  };

  enrichedBooks.push(book);
});

// Sort by title
enrichedBooks.sort((a, b) => a.title.localeCompare(b.title));

// Output
const output = {
  books: enrichedBooks,
  tags: Array.from(allTags).sort()
};

fs.writeFileSync('/home/wijnandb/sites/wijnandbaretta/static/data/books-enriched.json', JSON.stringify(output, null, 2));
console.log(`Processed ${enrichedBooks.length} books with ${allTags.size} unique tags`);
