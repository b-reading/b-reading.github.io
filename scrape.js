const fetch = require("node-fetch"); // musí být v2.x
const cheerio = require("cheerio");
const fs = require("fs");

const baseBaseUrl =
  "https://www.cbdb.cz/uzivatel-140154-hancik/knihy?booklist_2=1";

async function scrape() {
  const books = [];
  let page = 1;

  while (true) {
    const url = `${baseBaseUrl}&actual_page=${page}`;
    console.log("Stahuju:", url);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
        "Accept-Language": "cs-CZ,cs;q=0.9"
      }
    });

    const html = await res.text();
    const $ = cheerio.load(html);

    const items = $(".book_items .book_item");
    if (!items.length) break;

    items.each((_, el) => {
      const titleEl = $(el).find(".book_item_name a").first();
      const authorEl = $(el).find(".book_item_author a").first();

      const title = titleEl.text().trim();
      const author = authorEl.text().trim();
      const link = titleEl.attr("href");

      if (title) {
        books.push({
          title,
          author,
          link: link ? `https://www.cbdb.cz${link}` : null
        });
      }
    });

    page++;
  }

  fs.writeFileSync("static/books.json", JSON.stringify(books, null, 2));
  console.log(`Hotovo! Nalezeno ${books.length} knih.`);
}

scrape();

//