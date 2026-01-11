const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");

const users = [
  {username: "142475-dajmond", label: "Dominik"},
  {username: "140154-hancik", label: "hancik"},
  {username: "142474-lammy", label: "Daniel"},
  {username: "209349-jakub-kruzik", label: "Jakub"},
];

const outputFile = "static/books.json";

// Helper: fetch with retries and timeout
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      console.warn(`Fetch failed (attempt ${i + 1}): ${url}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 3000)); // wait 3s before retry
    }
  }
}

// Scrape all pages for one user
async function scrapeUser(user) {
  const books = [];

  const firstPageUrl = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1&actual_page=1`;
  let totalPages = 1;

  try {
    const res = await fetchWithRetry(firstPageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "cs-CZ,cs;q=0.9"
      },
      timeout: 20000
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    // Detect total pages from pagination
    const pages = $(".text-center a.pagination_item")
      .map((_, el) => parseInt($(el).text()))
      .get()
      .filter(n => !isNaN(n));

    totalPages = pages.length ? Math.max(...pages) : 1;
    console.log(`${user.label}: ${totalPages} pages detected`);
  } catch (e) {
    console.error(`Error fetching first page for ${user.label}:`, e);
    return books; // return empty if first page fails
  }

  for (let page = 1; page <= totalPages; page++) {
    const url = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1&actual_page=${page}`;
    console.log(`Scraping ${user.label}, page ${page}: ${url}`);

    try {
      const resPage = await fetchWithRetry(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "cs-CZ,cs;q=0.9"
        },
        timeout: 20000
      });
      const htmlPage = await resPage.text();
      const $page = cheerio.load(htmlPage);

      const items = $page(".book_items .book_item");
      if (items.length === 0) {
        console.warn(`No books found on page ${page} for ${user.label}`);
      }

      items.each((_, el) => {
        const titleEl = $page(el).find(".book_item_name a").first();
        const title = titleEl.text().trim();
        const author = $page(el).find(".book_item_author a").first().text().trim();
        const link = titleEl.attr("href") ? `https://www.cbdb.cz${titleEl.attr("href")}` : null;

        if (title) books.push({title, author, link});
      });

      // Delay 1s between pages to avoid overloading the server
      await new Promise(r => setTimeout(r, 1000));
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
      if (!merged[key]) merged[key] = {...book, readers: []};
      merged[key].readers.push(user.label);
    }
  }

  const finalBooks = Object.values(merged);
  fs.writeFileSync(outputFile, JSON.stringify(finalBooks, null, 2));
  console.log(`Done! ${finalBooks.length} books saved to ${outputFile}`);
})();
