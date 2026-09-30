#!/usr/bin/env node
// GM AutoPrep automation GM — keeps one headless GM logged into your Foundry world so the
// assistant can work when nobody has Foundry open. It configures itself: it writes the hub token
// and its own hub address into the module settings for its user, and claims the "Automation user"
// setting if nobody has. It never enables modules or changes anything else in the world.
//
// env:
//   FOUNDRY_URL             http://foundry:30000       where this container reaches Foundry
//   AUTOPREP_USER           name of the GM account to log in as (make one just for this)
//   AUTOPREP_PASSWORD       its password  (or AUTOPREP_PASSWORD_FILE)
//   AUTOPREP_TOKEN          the hub token (or AUTOPREP_TOKEN_FILE, default /data/token)
//   AUTOPREP_HUB_WS         ws://hub:30777/foundry     the hub address as seen from this browser
//   CHROMIUM_PATH           /usr/bin/chromium
//   AUTOPREP_HEALTH_FILE    /tmp/autoprep-healthy      touched while the world is ready

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const MODULE = "gm-autoprep";
const URL_ = (process.env.FOUNDRY_URL || "http://foundry:30000").replace(/\/$/, "");
const USER = process.env.AUTOPREP_USER;
const read = (v, f) => v || (f && fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "");
const PASSWORD = read(process.env.AUTOPREP_PASSWORD, process.env.AUTOPREP_PASSWORD_FILE);
const TOKEN = read(process.env.AUTOPREP_TOKEN, process.env.AUTOPREP_TOKEN_FILE || "/data/token");
const HUB_WS = process.env.AUTOPREP_HUB_WS || "";
const CHROMIUM = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const HEALTH = process.env.AUTOPREP_HEALTH_FILE || "/tmp/autoprep-healthy";

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!USER) { log("AUTOPREP_USER is required — the Foundry GM account this automation logs in as."); process.exit(2); }
if (!TOKEN) log("warning: no hub token (AUTOPREP_TOKEN / AUTOPREP_TOKEN_FILE) — will log in but can't configure the module.");

let browser, page;

async function launch() {
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, protocolTimeout: 600000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1600,900", "--mute-audio"] });
  browser.on("disconnected", () => { log("browser exited — restarting"); browser = null; });
  page = await browser.newPage();
  page.on("pageerror", (e) => log("[page error]", String(e).slice(0, 200)));
  page.on("console", (m) => { const t = m.text(); if (/GM AutoPrep|gm-autoprep/i.test(t)) log("[page]", t.slice(0, 300)); });
}

// Returns "ready" | "no-world" | "failed: …"
async function join() {
  await page.goto(`${URL_}/join`, { waitUntil: "networkidle2", timeout: 90000 });
  if (page.url().includes("/setup") || page.url().includes("/auth")) return "no-world";
  if (page.url().includes("/game")) { /* session cookie still valid */ }
  else {
    const found = await page.waitForSelector('select[name="userid"]', { timeout: 30000 }).then(() => true).catch(() => false);
    if (!found) return "failed: no join form (is a world running?)";
    const picked = await page.evaluate((name) => {
      const sel = document.querySelector('select[name="userid"]');
      const opt = [...sel.options].find((o) => o.textContent.trim() === name);
      if (!opt) return false;
      sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); return true;
    }, USER);
    if (!picked) return `failed: no user named "${USER}" in this world`;
    if (PASSWORD) await page.type('input[name="password"]', PASSWORD);
    await Promise.all([page.click('button[name="join"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {})]);
    if (!page.url().includes("/game")) return "failed: login rejected (check AUTOPREP_PASSWORD)";
  }
  const ready = await page.waitForFunction(() => globalThis.game?.ready === true, { timeout: 180000, polling: 1000 })
    .then(() => true).catch(() => false);
  return ready ? "ready" : "failed: world never became ready";
}

// Point the module at the hub. Returns true if the page must reload for settings to apply.
async function configure() {
  return page.evaluate(async ({ MODULE, TOKEN, HUB_WS }) => {
    const out = { changed: [], notes: [] };
    const mod = game.modules.get(MODULE);
    if (!mod?.active) { out.notes.push(`the "${MODULE}" module is not enabled in this world — enable it in Manage Modules`); return out; }
    if (!game.user.isGM) { out.notes.push(`${game.user.name} is not a GM — give this account the Gamemaster role`); return out; }
    const get = (k) => game.settings.get(MODULE, k);
    if (TOKEN && get("token") !== TOKEN) { await game.settings.set(MODULE, "token", TOKEN); out.changed.push("token"); }
    if (HUB_WS && get("hubUrlLocal") !== HUB_WS) { await game.settings.set(MODULE, "hubUrlLocal", HUB_WS); out.changed.push("hubUrlLocal"); }
    const who = get("automationUser").trim();
    if (!who) { await game.settings.set(MODULE, "automationUser", game.user.name); out.changed.push("automationUser"); }
    else if (who !== game.user.name && who !== game.user.id) out.notes.push(`"Automation user" is set to "${who}", not "${game.user.name}" — this client will stand by`);
    return out;
  }, { MODULE, TOKEN, HUB_WS });
}

async function status() {
  return page.evaluate((MODULE) => ({
    ready: globalThis.game?.ready === true,
    module: game.modules.get(MODULE)?.api?.status?.() ?? null,
    world: game.world?.id,
  }), MODULE).catch(() => ({ ready: false }));
}

async function main() {
  let backoff = 5000, lastStatus = "";
  for (;;) {
    try {
      if (!browser) await launch();
      const r = await join();
      if (r !== "ready") {
        fs.rmSync(HEALTH, { force: true });
        log(r === "no-world" ? "Foundry has no world running — waiting" : r);
        await sleep(backoff); backoff = Math.min(backoff * 2, 120000); continue;
      }
      backoff = 5000;
      const cfg = await configure();
      for (const n of cfg.notes) log("note:", n);
      if (cfg.changed.length) {
        log("configured", cfg.changed.join(", "), "— reloading");
        await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
        await page.waitForFunction(() => globalThis.game?.ready === true, { timeout: 180000 }).catch(() => {});
      }
      log(`logged in as ${USER}`);
      // watch loop
      for (;;) {
        await sleep(30000);
        const s = await status();
        if (!s.ready) { log("session lost — rejoining"); break; }
        fs.writeFileSync(HEALTH, String(Date.now()));
        const line = s.module ? `${s.module.status}${s.module.detail ? ` (${s.module.detail})` : ""}` : "module not loaded";
        if (line !== lastStatus) { log(`${s.world}: hub ${line}`); lastStatus = line; }
      }
    } catch (e) {
      log("error:", String(e).slice(0, 300));
      fs.rmSync(HEALTH, { force: true });
      try { await browser?.close(); } catch {}
      browser = null;
      await sleep(backoff); backoff = Math.min(backoff * 2, 120000);
    }
  }
}

const shutdown = async () => { try { await browser?.close(); } catch {} process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
main();
