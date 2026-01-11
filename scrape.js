const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");

const users = [
  {username: "hancik", label: "Já"},
  {username: "mama", label: "Mamka"},
  {username: "bratr", label: "Brácha"}
];

const outputFile = "static/books.json";

async function scrapeUser(user) {
  const books = [];
  let page = 1;
  const baseUrl = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1`;

  while (true) {
    const url = `${baseUrl}&actual_page=${page}`;
    console.log(`Scraping ${user.label}:`, url);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "cs-CZ,cs;q=0.9"
      }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const items = $(".book_items .book_item");
    if (!items.length) break;

    items.each((_, el) => {
      const titleEl = $(el).find(".book_item_name a").first();
      const title = titleEl.text().trim();
      const author = $(el).find(".book_item_author a").first().text().trim();
      const link = titleEl.attr("href") ? `https://www.cbdb.cz${titleEl.attr("href")}` : null;

      if (title) {
        books.push({title, author, link});
      }
    });
    page++;
  }

  return books;
}

(async () => {
  const merged = {};

  for (const user of users) {
    const userBooks = await scrapeUser(user);
    for (const book of userBooks) {
      const key = `${book.title}||${book.author}`;
      if (!merged[key]) merged[key] = {...book, readers: []};
      merged[key].readers.push(user.label);
    }
  }

  const finalBooks = Object.values(merged);
  fs.writeFileSync(outputFile, JSON.stringify(finalBooks, null, 2));
  console.log(`Done! ${finalBooks.length} books saved.`);
})();
