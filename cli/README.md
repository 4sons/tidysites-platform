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
| `tidysites pull [--collections pages,services,menus]` | the website's content to files; files for entries the website no longer has are removed |
| `tidysites status` | what changed here since the pull |
| `tidysites validate` | every file against the content model, with the file and the field in each message |
| `tidysites push [--prune] [--force] [--dry] [--only pages]` | validate, then write the created and updated entries back (with `--prune`, delete the entries whose files are gone), then pull |
| `tidysites shot <path or url> [--mobile] [--tablet] [--desktop] [--wide] [--all] [--first-screen] [--live]` | a screenshot of a page of the preview site, the live site, or any address, saved under `.tidysites/shots/`; none of the width flags means desktop and mobile; a port compares all four. A page taller than 2400px comes in 1600px bands (`<name>-band-01.jpg`, …), top to bottom, that an image reader can take in one at a time |
| `tidysites measure <path or url> [--mobile] [--tablet] [--desktop] [--wide] [--all] [--full]` | the page as the browser lays it out: every heading, paragraph, button, picture and section box with its computed type (size, line height, weight, family, colour) and box (position, size, padding, margin, background), saved as JSON under `.tidysites/measures/` and printed. Measure the old page and the new one at the same width and style to the numbers |
| `tidysites redirect [add <old path> <new path> \| rm <old path>]` | the website's redirects: an old address that must keep working after a port goes here; they ship with the next publish |
| `tidysites pages` | every address the website renders |
| `tidysites page <path> [--html]` | the rendered page, section by section, with the key each section carries |
| `tidysites schema [type or collection]` | the section types and layouts, or one type's or collection's fields |
| `tidysites gallery [type]` | a screenshot of every section type and layout in this website's theme, or the first screen of one type |
| `tidysites fetch <url> [--out dir]` | a page of the site being ported: cleaned HTML, its outline (headings, navigation, images, phones, fonts, the stylesheet's own variables and colours) and its stylesheets, inline style blocks included |
| `tidysites rm <collection>/<slug> ...` | delete entry files with their sidecars (`services/*` for every entry of a collection); `push --prune` then removes them from the website |
| `tidysites publish --yes` | the live site becomes a copy of the preview site. A website that is live on the client's own domain is never published from the command line: the website refuses and says so; the person publishes it (Publish now on the Website tab), or an assistant with them does through the connector after they confirm |

A section keeps its type with its key: to replace an intro with a row, give the row its own `_key`
(`validate` says so; the website would only say "internal error"). After a push the pushed files take the
website's version (a `$media` becomes the stored image, `_version` appears); every other file stays as it is.

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
`draft`. Delete a file (`tidysites rm services/old-one`, or `services/*` for all) and `push --prune` removes the entry. A field taken
out of a file is cleared on the website at the next push. `id` and
`updated_at` are the website's; leave them as pulled. A pull never overwrites
a file you changed and have not pushed; it keeps the file and the difference
shows in `status`.

Images: an image field, a hero's image or a Columns image slot takes
`{ "$media": { "url": "https://...", "alt": "what it shows" } }` and the
push fetches the file into the website's library; a file the library already
holds (the same bytes) is reused, not added again. An image already in the
library keeps the value the pull gave it.

A picture in custom HTML is written as a plain `<img src="{{ s.image.url }}" alt="{{ s.image.alt }}">`: a stored picture gets its resized variants (`srcset`, and a `sizes` hint when none is written) on the way out, so a phone downloads a phone-sized file; write your own `sizes` when the picture is narrower than half the screen on a laptop, and your own `srcset` to take over entirely. Pictures in the first section load at once and the first of them asks to go first; pictures below load when they are needed, unless the markup says `loading="eager"`.

Every form carries a hidden trap field a scraper fills and a person never sees. A Forms record or a Request form section can add Cloudflare Turnstile through its **Spam protection** field; it is off unless chosen, and when chosen its script loads only as the form comes into view or is touched.

References: a record names another by its id (what the pull shows), or by
`"$ref:<slug>"` for one created in the same push.

Rich text (a section's `copy`, a post's `content`) is markdown.

Custom HTML (a row's `.html` file, a Columns HTML slot) reads the records:
`{{ business.phone }}`, `{{ page.title }}`, `{{#each services as s}}…{{ s.url }}…{{/each}}`,
`{{#if page.collection == "services"}}…{{/if}}`, and the drop-ins `{{> menu "primary"}}`,
`{{> logo}}`, `{{> phone}}`, `{{> address}}`, `{{> hours}}`, `{{> social}}`, `{{> year}}`,
`{{> button "Label" "/url" style=outline}}`, `{{> form "Name"}}`. A link to `#form:<Name>`
opens that form in a dialog. So a custom header is written once against `page.*` and
`business.*` and fits every page; `frame/frame.json` names it as `header_row`, or a page
names its own in `header_row`.

## Building a site from these files

1. `tidysites schema` for the section types, `tidysites gallery` to see them in this theme.
2. Records first: `business/business.json` (the company's name, tagline, phone, hours, brand), `locations/`, `services/`, `people/`, `reviews/`, `faqs/`.
3. `frame/frame.json` for the top bar, the call bar, the footer headings, the wording; `menus/primary.json` and `menus/footer.json` for the menus (an item with `children` is a dropdown).
4. Pages as sections: `pages/<slug>.json`, each a list in `data.sections`. Columns is the section for a band with no record behind it.
5. The look: brand colours and fonts on the Business record, `business/business.css` for what the tokens cannot say. The theme's own rules are written as `.ts.ts-accent` and `.ts.ts-ink .ts-prose a`, so a rule of yours needs the same weight (`.ts.ts-accent …`) to win.
6. `tidysites validate`, `tidysites push`, `tidysites shot / --all`, and look at every width: a design often shows a different header above 1440px.
