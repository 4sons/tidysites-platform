# The Tidysites template

One data shape, rendered by every theme. `structure.json` is the structure half of an EmDash seed: 24 collections, 35 section types, the two menus. No content, no design. It validates with EmDash's `validateSeed` (emdash 1.0.1).

## The model

- **There is one template.** Every site has every collection and every section type available. A dentist, a roofer, a bike shop with a repair bench and a marketing agency run the same schema; what differs is which records they fill and which sections their pages use.
- **Everything is optional.** A record needs its name (a review needs its quote, a FAQ its answer, a policy its text). Every other field is optional, because that is what real sites showed: a date on one review in eleven, a price on no service page, bios on cards for some and on profile pages for others.
- **The theme is the only choice.** A person picks a look and launches it. The theme decides which sections its pages use and how each renders. There are no profiles, presets or industry variants of the schema.
- **A theme renders; it never adds.** A theme may render any field or section type here and may ignore any. It adds no fields and no section types of its own. When a theme needs something this template lacks, the template grows, additively, and every theme may render the new piece or ignore it. That rule is what lets a site switch themes without touching its content, and what lets a site owner's assistant add products, service areas or case studies to a site whose theme never showed them: the data has a home already.
- **The plugin owes a default rendering of every section type** so that a section a theme never shipped still renders when an owner adds it, and the theme's own component takes over when it has one. Not built yet; it is the next piece.
- **Live sites take template changes through the schema apply** (`POST /_tidy/schema`, run after every staging deploy). Definitions are updated or created, nothing is deleted. Retiring a field is a separate, deliberate step once no live site holds data in it.

## What is in it

Business and place: `business` (the one record every page reads: name, phones with purposes, address and whether to show it, hours in one line, booking, portal, forms and store links, languages, rating and count, insurance and programs lines, licence, insured and warranty lines, accessibility, parking, directions, emergency line, service-area line, social, brand tokens, analytics ids), `locations` (per-day hours, parking, directions, transit, map, booking per location; exists even for one location so growth is never a migration), `service_areas` (places served, with neighbourhoods, coordinates, distance, home base).

What they do: `service_categories`, `services` (with a call-to-action kind, price from, duration, free consultation, in-season flag, providers through reviews and cases), `conditions` (what customers search for, pointing at the service that treats it), `technologies`, `products` (name, category, brand, price, images, variants, stock, buy or enquire link), `brands`.

Who they are: `people` (role, group, credentials, licence, two bio lengths, education, memberships, awards, languages, pronouns, video, start year, status note, owner flag, own-page flag), `badges` (associations, certifications, awards and seals with issuer and year), `clients` (logo wall), `case_studies` (situation, approach, outcome, three result numbers, quote).

Proof: `reviews` (quote, display name, rating, source, date, photo, service, service area, provider, video, featured), `cases` (before and after with problem and treatment).

Money and admin: `plans` (memberships, packages, tiers, banked credit), `insurers` (network status, note, which services), `financing_providers`, `offers` (with how to claim and an end date), `downloads` (intake, consent, pre-op, post-op), `policies`.

Pages and words: `pages`, `posts`, `faqs`, and a `sections` field on pages, services, service categories, service areas and case studies that holds any of the 35 section types.

Section types: hero (five layouts incl. a picker), intro, services (five layouts), feature or why choose us (with bullets, steps, photo side), steps, team (four layouts), reviews (four), cases (three), faq, stats, badges, insurance (three), financing, plans, contact or request form (three, each question a switch), location (per-day or grouped hours), locations, cta (three), gallery (three), video, technologies, brands, offer, conditions, downloads, policies, posts, areas (four), products (three), case_studies (three), clients (three), signs, options, related, custom (HTML, CSS and script in an isolated frame).

## Where the shape came from

Read by hand, with every claim tied to the URL it was seen on: six sites in a pilot (three roofers, three dentists), then eleven local service sites (seven dental, plus chiropractic, med spa, optometry and physiotherapy), plus the pest-control template's own collections for the service-area side. The evidence tables below are from the local service read; the counts are out of eleven unless said. Service-area, shop and agency evidence is thinner (the pilot's roofers and the pest template) and those parts of the schema will be revised as those kinds are read.

