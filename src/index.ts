import { parse } from "node-html-parser";
import fs from "fs";

if (fs.existsSync(".env")) {
  try {
    await import("dotenv/config");
  } catch {
    console.log("Failed to load .env file, is dotenv installed?");
  }
}

type SwappaEntry = {
  title: string;
  code: string;
  url: string;
  price: number;
};

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.3";

const {
  WEBHOOK_URL,
  YOUR_DISCORD_ID,
  PRODUCT_PAGE,
  MAX_PRICE,
  DELAY_MS,
  USER_AGENT,
} = process.env;

if (
  !WEBHOOK_URL ||
  !YOUR_DISCORD_ID ||
  !PRODUCT_PAGE ||
  !MAX_PRICE ||
  !DELAY_MS
) {
  console.log("Missing environment variables");
  process.exit(1);
}

const MAX_PRICE_NUM = Number(MAX_PRICE);
if (!Number.isFinite(MAX_PRICE_NUM)) {
  console.log("Invalid MAX_PRICE environment variable");
  process.exit(1);
}

const DELAY_NUM = Number(DELAY_MS);
if (!Number.isFinite(DELAY_NUM)) {
  console.log("Invalid DELAY_MS environment variable");
  process.exit(1);
}

async function sendWebhook(entries: SwappaEntry[]) {
  const date = new Date();

  const res = await fetch(WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": USER_AGENT || DEFAULT_USER_AGENT,
    },
    body: JSON.stringify({
      content: `<@!${YOUR_DISCORD_ID}>`,
      embeds: [
        {
          title: `Found ${entries.length} listings`,
          url: PRODUCT_PAGE,
          footer: {
            text: `Made by BirdRoad1 • https://github.com/BirdRoad1/swappabot • ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`,
          },
          fields: entries.map((e) => ({
            name: `$${e.price} - ${e.title}`,
            value: `[URL](${e.url})`,
            inline: false,
          })),
        },
      ],
      username: "SwappaBot",
      avatar_url:
        "https://static.swappa.com/static/images/logos/favicon.png?v=2",
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}

const checkedCodes: string[] = [];

async function loop() {
  console.log("Checking...", new Date().toLocaleTimeString());

  try {
    const res = await fetch(PRODUCT_PAGE!, {
      headers: {
        "user-agent": USER_AGENT || DEFAULT_USER_AGENT,
      },
    });

    const txt = await res.text();
    const document = parse(txt);

    const listings = document.querySelectorAll("#listings_table > tbody > tr");

    let entries: SwappaEntry[] = [];

    for (const listing of listings) {
      const priceElem = listing.querySelector("td:nth-child(2) a");
      const codeElem = listing.querySelector("td:nth-child(14) a");

      if (!priceElem || !codeElem) {
        continue;
      }

      const priceStr = priceElem.textContent.trim().substring(1);
      const price = Number(priceStr);
      const code = codeElem.textContent.trim();
      const title = codeElem.getAttribute("title") ?? "No title";

      if (!Number.isFinite(price)) {
        console.log("Found invalid price:", price);
      }

      if (price <= MAX_PRICE_NUM) {
        const url = priceElem.hasAttribute("href")
          ? "https://swappa.com" + priceElem.getAttribute("href")
          : null;

        if (url === null || checkedCodes.includes(code)) {
          continue;
        }

        entries.push({
          code,
          url,
          price,
          title,
        });
      }
    }

    entries.sort((a, b) => a.price - b.price);

    if (entries.length > 0) {
      try {
        await sendWebhook(entries);
        console.log(`Sent ${entries.length} listings to webhook`);
        checkedCodes.push(...entries.map((e) => e.code));
      } catch (err) {
        console.log("Failed to send webhook:", err);
      }
    } else {
      console.log("No new listings");
    }
  } catch (err) {
    console.log("Poll failed:", err);
  }

  console.log("Done checking", new Date().toLocaleTimeString());
}

setInterval(loop, DELAY_NUM);
loop();

export {};
