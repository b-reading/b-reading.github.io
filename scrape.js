const { fetch, Agent } = require("undici");
const cheerio = require("cheerio");
const fs = require("fs");

const users = [
  { username: "142475-dajmond", label: "Dominik" },
  { username: "140154-hancik", label: "hancik" },
  { username: "142474-lammy", label: "Daniel" },
  { username: "209349-jakub-kruzik", label: "Jakub" },
];

const outputFile = "static/books.json";

const agent = new Agent({
  keepAliveTimeout: 20000,
  keepAliveMaxTimeout: 20000,
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fetch with retries
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        dispatcher: agent,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      return res;
    } catch (err) {
      console.warn(`Fetch failed (attempt ${i + 1}): ${url}`);

      if (i === retries - 1) throw err;

      await sleep(3000);
    }
  }
}

// Scrape user pages
async function scrapeUser(user) {
  const books = [];

  const firstPageUrl = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1&actual_page=1`;

  let totalPages = 1;

  try {
    const res = await fetchWithRetry(firstPageUrl);
    const html = await res.text();

    const $ = cheerio.load(html);

    const pages = $(".text-center a.pagination_item")
      .map((_, el) => parseInt($(el).text()))
      .get()
      .filter((n) => !isNaN(n));

    totalPages = pages.length ? Math.max(...pages) : 1;

    console.log(`${user.label}: ${totalPages} pages detected`);
  } catch (e) {
    console.error(`Error fetching first page for ${user.label}:`, e);
    return books;
  }

  for (let page = 1; page <= totalPages; page++) {
    const url = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1&actual_page=${page}`;

    console.log(`Scraping ${user.label}, page ${page}`);

    try {
      const res = await fetchWithRetry(url);
      const html = await res.text();

      const $ = cheerio.load(html);

      const items = $(".book_items .book_item");

      if (items.length === 0) {
        console.warn(`No books found on page ${page} for ${user.label}`);
      }

      items.each((_, el) => {
        const titleEl = $(el).find(".book_item_name a").first();

        const title = titleEl.text().trim();
        const author = $(el).find(".book_item_author a").first().text().trim();
        const link = titleEl.attr("href")
          ? `https://www.cbdb.cz${titleEl.attr("href")}`
          : null;

        if (title) {
          books.push({
            title,
            author,
            link,
          });
        }
      });

      await sleep(1000);
    } catch (e) {
      console.error(`Error fetching ${user.label} page ${page}:`, e);
    }
  }

  return books;
}

(async () => {
  const merged = {};

  for (const user of users) {
    const userBooks = await scrapeUser(user);

    console.log(`${user.label}: ${userBooks.length} books scraped`);

    for (const book of userBooks) {
      const key = `${book.title}||${book.author}`;

      if (!merged[key]) {
        merged[key] = { ...book, readers: [] };
      }

      merged[key].readers.push(user.label);
    }

    await sleep(5000);
  }

  const finalBooks = Object.values(merged);

  fs.writeFileSync(outputFile, JSON.stringify(finalBooks, null, 2));

  console.log(`Done! ${finalBooks.length} books saved to ${outputFile}`);
})();
