// onResolve for web-scraping.dev/products consumables section with pagination
// Uses icnx.dom.fetch/select injected APIs

async function onResolve(url, ctx) {
  const base = 'https://web-scraping.dev/products?category=consumables&page=';
  const maxPages = (ctx && ctx.maxPages) ? Number(ctx.maxPages) : 0; // 0 = auto-discover

  // Discover total pages by scanning pagination links on the first page
  const firstHtml = await icnx.dom.fetch(base + '1&sort=desc');
  const pagers = await icnx.dom.select(firstHtml, 'a[href*="category=consumables"][href*="page="]');
  let lastPage = 1;
  for (const a of pagers) {
    const href = a.attrs?.href || '';
    const m = href.match(/page=(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) lastPage = Math.max(lastPage, n);
    }
  }
  if (maxPages > 0) lastPage = Math.min(lastPage, maxPages);

  const items = [];
  for (let p = 1; p <= lastPage; p++) {
    const pageUrl = base + p + '&sort=desc';
    const html = await icnx.dom.fetch(pageUrl);
    // Target images within product cards or links to products
    const candidates = await icnx.dom.select(html, 'a[href*="/products/"] img, article img, li img, .product img, main img');
    for (const img of candidates) {
      const src = (img.attrs && (img.attrs.src || img.attrs['data-src'])) || '';
      if (!src) continue;
      const abs = src.startsWith('http') ? src : new URL(src, pageUrl).toString();
      const filename = abs.split('/').pop() || 'image.jpg';
      if (/\.svg($|\?)/i.test(filename)) continue;
      const title = (img.attrs?.alt || filename).toString();
      const item = { url: abs, filename, title, type: 'image' };
      icnx.emitPartial(item);
      items.push(item);
    }
  }

  // De-duplicate by URL and prefer distinct filenames
  //const out = [];
  //const seen = new Set();
  //for (const it of items) { if (!seen.has(it.url)) { seen.add(it.url); out.push(it); } }
  emit({ dir: 'web-scraping-dev/consumables', items: items });
}


