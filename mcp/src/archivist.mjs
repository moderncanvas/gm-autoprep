// Archivist (https://myarchivist.ai) — session recordings, summaries, moments and characters.
// Read-only. The DM's own API key comes from ARCHIVIST_API_KEY or ~/.gm-autoprep/config.json.

const BASE = "https://api.myarchivist.ai";

export function makeArchivist(getKey) {
  async function get(pathname, params = {}) {
    const key = getKey();
    if (!key) throw new Error("No Archivist API key. Set ARCHIVIST_API_KEY or add \"archivistApiKey\" to ~/.gm-autoprep/config.json.");
    const url = new URL(pathname, BASE);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const r = await fetch(url, { headers: { "x-api-key": key } });
    if (!r.ok) throw new Error(`Archivist ${pathname} returned HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }

  // Walk every page (the API caps page size at 100).
  async function all(pathname, params) {
    const out = [];
    for (let page = 1; ; page++) {
      const r = await get(pathname, { ...params, size: 100, page });
      out.push(...(r.data ?? []));
      if (!r.pages || page >= r.pages) return out;
    }
  }

  return {
    // Sittings in play order. `sitting` is 1-based chronological position — note that a campaign's
    // own session numbers can differ (one session may span two sittings; some sittings have no recap).
    async sessions(campaignId) {
      const list = await all("/v1/sessions", { campaign_id: campaignId });
      return list.sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)))
        .map((s, i) => ({ sitting: i + 1, id: s.id, title: s.title, date: s.session_date, type: s.type,
          summaryChars: (s.summary ?? "").length }));
    },
    async session(campaignId, sessionId) {
      const s = (await all("/v1/sessions", { campaign_id: campaignId })).find((x) => x.id === sessionId);
      if (!s) throw new Error(`No session ${sessionId} in campaign ${campaignId}`);
      return { id: s.id, title: s.title, date: s.session_date, type: s.type, summary: s.summary, notes: s.notes };
    },
    // The API ignores its own session_id filter, so filter here.
    async moments(campaignId, sessionId) {
      const list = await all("/v1/moments", { campaign_id: campaignId });
      return list.filter((m) => !sessionId || m.session_id === sessionId)
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((m) => ({ index: m.index, label: m.label, content: m.content, session: m.session_id }));
    },
    async characters(campaignId) {
      return (await all("/v1/characters", { campaign_id: campaignId }))
        .map((c) => ({ id: c.id, name: c.character_name, aliases: c.character_aliases, type: c.type,
          player: c.player_name ?? null, description: c.description }));
    },
  };
}
