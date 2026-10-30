# tidysites

A Tidysites website as files. Pull every record and page to a folder, edit
them (by hand, with an editor, or with an assistant), check them against the
website's content model, push the changes back in one write, and look at
the result. The website is the remote: pull, edit, push.

```
npx -y @tideworthy/tidysites@latest init <site_id> --host https://app.tideworthy.com --key <key>
```

The connector prints that command, with the key filled in, from its
`connect_tidysites_cli` tool. The key reaches the workspace's websites and
nothing else; it lives in `.tidysites/key`, which is kept out of git.

## Commands

| | |
|---|---|
| `tidysites init <site_id> --host <url> --key <key>` | connect this folder to a website and pull it |
| `tidysites pull [--collections pages,services]` | the website's content to files; files for entries the website no longer has are removed |
| `tidysites status` | what changed here since the pull |
| `tidysites validate` | every file against the content model, with the file and the field in each message |
| `tidysites push [--prune] [--force] [--dry] [--only pages]` | validate, then write the created and updated entries back (with `--prune`, delete the entries whose files are gone), then pull |
| `tidysites shot <path or url> [--mobile] [--desktop] [--first-screen] [--live]` | a screenshot of a page of the preview site, the live site, or any address, saved under `.tidysites/shots/` |
| `tidysites pages` | every address the website renders |
| `tidysites page <path> [--html]` | the rendered page, section by section, with the key each section carries |
| `tidysites schema [type or collection]` | the section types and layouts, or one type's or collection's fields |
| `tidysites gallery [type]` | a screenshot of every section type and layout in this website's theme, or the first screen of one type |
| `tidysites fetch <url> [--out dir]` | a page of the site being ported: cleaned HTML, its outline (headings, navigation, images, phones, fonts, colours) and its stylesheets |
| `tidysites publish --yes` | the live site becomes a copy of the preview site |

A push that would overwrite an entry changed on the website since the pull
is refused with the list; pull again (your files are overwritten, so copy
what you need first) or push `--force`.

## The folder

```
<collection>/<slug>.json      { "id", "slug", "status", "updated_at", "data": { ... } }
<collection>/<slug>.css       data.custom_css as a file (for rows: data.css)
rows/<slug>.html              data.html as a file
menus/<name>.json             a menu as a tree: { "label", "items": [{ "label", "url", "children": [...] }] }
.tidysites/                   config.json, key, snapshot.json (the last pull), schema.json (the content model), shots/, source/
```

A new entry is a new `<collection>/<slug>.json` with at least `"data"`; the
slug is the file name, the status is `published` unless the file says
`draft`. Delete a file and `push --prune` removes the entry. A field taken
out of a file is cleared on the website at the next push. `id` and
`updated_at` are the website's; leave them as pulled. A pull never overwrites
a file you changed and have not pushed; it keeps the file and the difference
shows in `status`.

Images: an image field, a hero's image or a Columns image slot takes
`{ "$media": { "url": "https://...", "alt": "what it shows" } }` and the
push fetches the file into the website's library. An image already in the
library keeps the value the pull gave it.

References: a record names another by its id (what the pull shows), or by
`"$ref:<slug>"` for one created in the same push.

Rich text (a section's `copy`, a post's `content`) is markdown.

## Building a site from these files

1. `tidysites schema` for the section types, `tidysites gallery` to see them in this theme.
2. Records first: `business/business.json` (the company's name, tagline, phone, hours, brand), `locations/`, `services/`, `people/`, `reviews/`, `faqs/`.
3. `frame/frame.json` for the top bar, the call bar, the footer headings, the wording; `menus/primary.json` and `menus/footer.json` for the menus (an item with `children` is a dropdown).
4. Pages as sections: `pages/<slug>.json`, each a list in `data.sections`. Columns is the section for a band with no record behind it.
5. The look: brand colours and fonts on the Business record, `business/business.css` for what the tokens cannot say. The theme's own rules are written as `.ts.ts-accent` and `.ts.ts-ink .ts-prose a`, so a rule of yours needs the same weight (`.ts.ts-accent …`) to win.
6. `tidysites validate`, `tidysites push`, `tidysites shot /` and `tidysites shot / --mobile`, and look.
