---
name: Infrastructure ownership split
description: GitHub repo under Benjamin-Sterrett (portfolio), Cloudflare Pages + Firebase under client's accounts (long-term ownership)
type: project
originSessionId: c7893804-042b-4feb-a0d5-db26cada1a4b
---
Anwarallys Fabric Inventory has a deliberate split:

- **GitHub repo:** `Benjamin-Sterrett/anwarallys-fabric-inventory` — stays under Benjamin's GH account for portfolio visibility.
- **Cloudflare Pages:** Client's account (`Shaaizladhani@gmail.com`, ID `74465de04ed5c39b43ad9ffc8b47bc08`). Existing prototype: `anwarallysinventory.pages.dev`.
- **Firebase:** Client's account (TBD project ID, client to grant access).

**Why:** Benjamin is building this cheap as a portfolio piece but the client must own the running infrastructure long-term. If Benjamin stops maintaining it, the client still owns his deploy pipeline, domain, and data. The repo being under Benjamin's GH gives him the portfolio credit without trapping the client.

**How to apply:**
- Deploys happen on client's Cloudflare account, not Benjamin's.
- Client must OAuth *his* Cloudflare into Benjamin's GitHub repo (one-time setup, done via dash.cloudflare.com, not wrangler).
- Never suggest moving hosting or Firebase to Benjamin's account — that would trap the client.
- If the client ever needs to bring this in-house, he forks the repo and his accounts already own the infra.
