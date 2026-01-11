const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");

const users = [
  {username: "142475-dajmond", label: "Dominik", maxPage: 3},
  {username: "140154-hancik", label: "hancik", maxPage: 9},
  {username: "142474-lammy", label: "Daniel", maxPage: 2},
  {username: "209349-jakub-kruzik", label: "Jakub", maxPage: 1},
];

const outputFile = "static/books.json";

async function scrapeUser(user) {
  const books = [];
  for (let page = 1; page <= user.maxPage; page++) {
    const url = `https://www.cbdb.cz/uzivatel-${user.username}/knihy?booklist_2=1&actual_page=${page}`;
    console.log(`Scraping ${user.label}, page ${page}: ${url}`);
    try {
      const res = await fetch(url, {
        headers: {"User-Agent": "Mozilla/5.0", "Accept-Language": "cs-CZ,cs;q=0.9"}
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

        if (title) books.push({title, author, link});
      });
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
