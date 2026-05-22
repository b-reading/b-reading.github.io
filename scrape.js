const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const { chromium } = require("playwright");
const cheerio = require("cheerio");
const fs = require("fs");

const users = [
  { username: "142475-dajmond", label: "Dominik" },
  { username: "140154-hancik", label: "hancik" },
  { username: "142474-lammy", label: "Daniel" },
  { username: "209349-jakub-kruzik", label: "Jakub" },
];

const outputFile = "static/books.json";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getPageHTML(page, url) {
  console.log("Loading:", url);

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // small delay for JS-rendered pages / anti-bot protection
  await page.waitForTimeout(1500);

  return await page.content();
}

async function scrapeUser(page, user) {
  const books = [];

  const firstUrl = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1&actual_page=1`;

  let totalPages = 1;

  try {
    const html = await getPageHTML(page, firstUrl);
    const $ = cheerio.load(html);

    const pages = $(".text-center a.pagination_item")
      .map((_, el) => parseInt($(el).text()))
      .get()
      .filter((n) => !isNaN(n));

    totalPages = pages.length ? Math.max(...pages) : 1;

    console.log(`${user.label}: ${totalPages} pages detected`);
  } catch (e) {
    console.error(`Failed first page ${user.label}`, e);
    return books;
  }

  for (let p = 1; p <= totalPages; p++) {
    const url = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1&actual_page=${p}`;

    try {
      const html = await getPageHTML(page, url);
      const $ = cheerio.load(html);

      const items = $(".book_items .book_item");

      if (!items.length) {
        console.warn(`No books found: ${user.label} page ${p}`);
      }

      items.each((_, el) => {
        const titleEl = $(el).find(".book_item_name a").first();

        const title = titleEl.text().trim();
        const author = $(el).find(".book_item_author a").first().text().trim();

        const link = titleEl.attr("href")
          ? `https://www.cbdb.cz${titleEl.attr("href")}`
          : null;

        if (title) {
          books.push({ title, author, link });
        }
      });

      await sleep(1200);
    } catch (e) {
      console.error(`Error ${user.label} page ${p}`, e);
    }
  }

  return books;
}

(async () => {
  if (!fs.existsSync("static")) {
    fs.mkdirSync("static");
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    locale: "cs-CZ",
  });

  const page = await context.newPage();

  const merged = {};

  for (const user of users) {
    const userBooks = await scrapeUser(page, user);

    console.log(`${user.label}: ${userBooks.length} books scraped`);

    for (const book of userBooks) {
      const key = `${book.title}||${book.author}`;

      if (!merged[key]) {
        merged[key] = { ...book, readers: [] };
      }

      merged[key].readers.push(user.label);
    }

    await sleep(2000);
  }

  await browser.close();

  const finalBooks = Object.values(merged);

  fs.writeFileSync(outputFile, JSON.stringify(finalBooks, null, 2));

  console.log(`Done! ${finalBooks.length} books saved to ${outputFile}`);
})();