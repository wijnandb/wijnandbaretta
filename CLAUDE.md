# wijnandbaretta.com: the English site

This repo is **the English site of Wijnand Baretta**, served at **https://wijnandbaretta.com** through GitHub Pages (Actions build, `deploy.yml`).

It's one of three sites. The overall map, rules and monitoring live in `~/areas/baretta` (repo `wijnandb/web-presence`); read `~/areas/baretta/CLAUDE.md` before changing domains, DNS or what this site is for.

## What lives here
- English essays and posts (`content/posts/`), book notes (`content/books/`, ~686), projects, ideas, the feed.
- Later: the English counterpart of the Dutch home base (wijnandbaretta.nl), linked with hreflang.
- baretta.nl forwards here with the path intact (it served the predecessor `wijnandb/15-a-day` from 2021 to 2025, with the same paths), so **don't rename or move existing URLs** without adding aliases.

## What doesn't belong here
- Dutch home-base content (positioning, services, problems): that's `wijnandb/wijnandbaretta-nl` → wijnandbaretta.nl.
- Holding/studio content: that will be baretta.nl.

## Domain rules
- The custom domain is set in the repo's Pages settings (`gh api repos/wijnandb/wijnandbaretta/pages`), with `CNAME` as a mirror. Both must say `wijnandbaretta.com`.
- Never remove or change the custom domain without first pointing DNS somewhere else. A domain that points at GitHub without a repo claiming it is how baretta.nl was hijacked (2026).
- `deploy.yml` builds with the base URL from the Pages settings; `baseURL` in `hugo.toml` is for local builds.

## Automation
- `feed-rebuild.yml` commits feed refreshes twice a day (github-actions bot). Pull before you push.

## Known quality issue
Some book pages have a summary of a different book (e.g. "How the World Really Works", "Single Malt Whisky"). Fix it when you come across one; don't publish new AI-generated summaries without checking them.
