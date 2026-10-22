# Profiles

A profile is the data shape for one kind of business. It is the structure half of an EmDash seed: collections, their fields, the section types (block types) pages and services can hold, and the default menus. No content, no design.

Themes render a profile. A theme repo installs the profile's structure as its seed structure and may render any field or section type in it; a theme never adds a field or a section type of its own. When a theme needs something the profile does not have, the profile grows (an optional field or a new section type, both additive) and every theme of that profile may render it or ignore it. That rule is what lets a site switch themes without touching its content.

Existing sites take a profile change through the schema apply (`POST /_tidy/schema`, run by the control plane after every staging deploy): definitions are updated or created, nothing is deleted. Removing a field is a separate, deliberate step once no live site holds data in it.

| Profile | Folder | For |
|---|---|---|
| Local service | `local-service/` | the customer comes to the business: dental, chiropractic, physiotherapy, optometry, med spa, clinics, salons |
| Service area | not yet extracted | the business goes to the customer: roofing, pest, painting, lawn, tree, plumbing, HVAC; today inside `TidySites/template-pest-control` `seed/seed.json` |
| Service plus shop | not yet written | a service business that also sells products |
| Agency | not yet written | agencies and studios |

Each folder holds `structure.json` (the schema, in the seed shape, validated with EmDash's `validateSeed`) and `README.md` (the model in words: what each collection and section is for, which fields are required, and where the shape came from).
