// Tells Bing (and through it ChatGPT search, Yandex, Naver) which pages exist
// right now, instead of waiting days for a crawl. Run after a deploy that adds
// or changes public pages:  pnpm indexnow
//
// The key is public by design: the engines fetch /<key>.txt from the site to
// prove whoever sent the ping controls the host. It is not a secret.
const HOST = "www.dailzero.com"
const KEY = "92173796b1a8a6a3aa727f64e4f98c93"

// The live sitemap is the list, so this can never announce a page that was not deployed.
const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text()
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())

if (urlList.length === 0) {
  console.error("[indexnow] no URLs found in the sitemap")
  process.exit(1)
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
})

// 200 = accepted, 202 = accepted but the key file is still being checked.
if (res.status !== 200 && res.status !== 202) {
  console.error(`[indexnow] rejected: ${res.status} ${await res.text()}`)
  process.exit(1)
}
console.log(`[indexnow] submitted ${urlList.length} URLs (${res.status})`)
