import assert from "node:assert/strict";

const site = new URL(
  process.argv[2] || "https://rockyhong-a11y.github.io/ring-breaker/",
);
const response = await fetch(site);
assert.equal(response.status, 200, `Page must return HTTP 200: ${site}`);
const html = await response.text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
  (match) => new URL(match[1], site),
);
assert(scripts.length > 0, "A production JavaScript entry is required");
for (const script of scripts) {
  assert(
    !script.pathname.endsWith(".ts"),
    `Raw TypeScript is being deployed: ${script}`,
  );
  assert(
    script.pathname.startsWith(site.pathname),
    `Script escapes the project path: ${script}`,
  );
  const asset = await fetch(script);
  assert.equal(asset.status, 200, `Missing game script: ${script}`);
  assert.match(
    asset.headers.get("content-type") || "",
    /javascript/,
    `Game script must have JavaScript MIME type: ${script}`,
  );
}
for (const match of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
  const url = new URL(match[1], site);
  if (url.origin !== site.origin) continue;
  assert(
    url.pathname.startsWith(site.pathname),
    `Asset escapes the project path: ${url}`,
  );
  assert.equal((await fetch(url)).status, 200, `Missing page asset: ${url}`);
}
for (const path of [
  "assets/sd-roster.png",
  "assets/sd-nova.png",
  "assets/sd-face-raven.webp",
  "assets/sd-face-valkyrie.webp",
  "assets/sd-face-viper.webp",
  "assets/sd-face-ember.webp",
  "assets/arena-poster.png",
  "manifest.webmanifest",
]) {
  const url = new URL(path, site);
  const asset = await fetch(url);
  assert.equal(asset.status, 200, `Missing public asset: ${url}`);
  if (path.endsWith(".webp"))
    assert.match(
      asset.headers.get("content-type") || "",
      /image\/webp/,
      `Invalid portrait: ${url}`,
    );
  if (path.endsWith(".png"))
    assert.match(
      asset.headers.get("content-type") || "",
      /image\/png/,
      `Invalid image: ${url}`,
    );
  if (path.endsWith(".webmanifest")) {
    const manifest = await asset.json();
    assert(
      new URL(manifest.start_url, url).pathname.startsWith(site.pathname),
      "Installed app must open the project path",
    );
    for (const icon of manifest.icons)
      assert.equal(
        (await fetch(new URL(icon.src, url))).status,
        200,
        "Missing app icon",
      );
  }
}
console.log(`Pages boot assets verified: ${site}`);
