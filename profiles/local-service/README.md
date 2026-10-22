# Local service profile

The customer comes to the business. Dental, chiropractic, physiotherapy, optometry, med spa, family clinics, salons and the like. `structure.json` beside this file is the schema; this file says what each part is for and where it came from.

## How to read it

- **business** is the one record every page reads: name, phones, address, hours in one line, booking link, languages, rating, social, brand tokens. One per site.
- **locations** carries per-day hours, parking and directions, and exists even for a one-location site so multi-location is never a migration.
- **service_categories** and **services** are the practice's work; categories are optional (seven of eleven sites used them). **conditions** is the second way patients search ("tooth pain", "dry eye") and points at the service that treats it.
- **people** carry roles, groups, credentials, bios in two lengths, education, memberships, languages, pronouns, video, and a flag for having their own page.
- **reviews** hold featured quotes with a display-name form, rating, source and date; the site-wide aggregate (rating, count, source) lives on business so a widget or the Business Profile can feed it.
- **cases** are before-and-after pairs with a problem and a treatment.
- **plans**, **insurers**, **financing_providers** cover what it costs; **downloads** and **policies** cover forms and rules; **technologies**, **brands**, **offers** are optional emphasis.
- Section types (block types) are what a page or a service page is built from. Most carry a `variant` select so one section can render several ways (a services grid as cards, tiles, icon cards, grouped, or a checklist) and the theme decides how each variant looks.

## Required versus optional

Only a record's name (and a review's quote, a FAQ's answer, a policy's text) is required. Every other field is optional, because that is what the sample showed: reviews carried a date on one site in eleven, team bios sat on profile pages on eight and on the card on four, prices appeared on no service page at all. A theme has to look right at the minimum shape (names and roles only, quotes with no stars) and gets richer as fields fill.

## Evidence: 1. Page types

| Page type | Sites | Notes |
|---|---|---|
| Home | 11 | |
| About (story, philosophy, values) | 10 | OD as an anchor; AKT's About is a menu of sub-pages |
| Team (all staff) | 11 somewhere, 9 as a page | BC groups by department; SP shows photos only |
| Provider profile (one person) | 8 | AKT 4, PD 2, SS 2, WD 1, BYP, AD, ME, BC via "learn more" |
| Services index | 10 | SP uses a flat dropdown instead |
| Service category | 7 | AKT 8, BYP 6, BD 5, SS 4, WD 3, PD 2, AD 1 |
| Individual service | 9 confirmed | BC script-rendered, OD none |
| Conditions or symptoms | 2 as pages, 1 as prose | AKT "Symptoms" (13), ME "Conditions" (5), SP prose |
| Reviews | 5 as a page | AKT, PD (written + video), SS (read + leave), AD (video), ME (link out) |
| Results, before and after, smile gallery | 3 | PD, BYP, WD (home section); all dental |
| FAQ or policies | 4 as a page | PD, AD, SP (policies), BC (new patients) |
| New patient, first visit, what to expect | 8 | AKT, PD, AD, BC, WD, SP, BYP (patient information), SS (forms) |
| Patient forms or downloads | 6 | SS 6 consent PDFs, WD 2 pages, BD 1 PDF, PD and AKT external portals, BC mention |
| Insurance | 6 | AKT, BC, ME, BD, AD, PD (inside for-patients) |
| Financing | 4 | AKT, AD, ME, BD |
| Membership plan or packages | 3 | AKT care plan with prices, ME banked-credit plan, BC packages mentioned |
| Booking (request page or external app) | 11 | external app on 6: AD, BC, SS, SP, WD, AKT; request-form page on PD, BD, BYP, OD hero |
| Contact | 11 | |
| Office tour | 5 | AKT, PD, SS, ME, AD |
| Technology or equipment | 4 | AKT (5 sub-pages), PD, SS, AD |
| Blog | 9 | |
| Offer page (free or no-cost consultation, promotion) | 5 | SP page, ME page + top bar, SS and AD as a line, BC gift cards |
| Refer a patient | 2 | BYP, ME (specialist and medical) |
| Shop or products | 3 | ME online store, BC course + gift cards, AKT external store |
| Community or giving back | 2 | PD page, BC heading |
| Second-language page | 1 | AD Chinese |
| Pricing (service price list) | 0 | prices appear only on membership plans (AKT) and one roofer's FAQ in the pilot |
| Careers | 1 seen | BD |

Pre-op and post-op instruction pages (BYP) and a study club page (BYP) are specialist one-offs.

## Evidence: 2. The business record (site-wide facts)

Required (11 of 11): name, phone, address, hours.

Optional, with counts:
- Second phone for text (AKT separate "Text", BC "call or text"): 2. A second location phone (AKT, 3 locations): 1. Three different numbers on one site (AD): a data-quality case.
- Email: 8 (AKT obfuscated, PD, BYP, AD, BC, ME, SP, BD). SS none.
- Fax: 3 (BC, ME, SP).
- Hours format: per day 8, grouped 4 (BYP, SP, WD, BD hero), both on one site 2 (BD, AKT). Empty day cells (AD), missing days (SS), staffing caveat (SP "no admin staff Sat/Sun"), "Sundays and Holidays" (ME).
- Parking note: 5 (PD, BYP, BC, ME with a price and an entrance note, SP). Transit or landmark directions: 3 (BYP, BC, AD).
- Founded year or years in business: 9. Contradictions on 3 (BD, ME, pilot roofer).
- Rating and review count: 5 (BYP "270+ Google 5-Star", ME "700+ reviews", SP "59 reviews", SS "5.0", BD widget). Count without a numeric rating: 3 of those.
- Languages: 4 claims (AKT 3 languages, AD 6, SP French, WD per person). One second-language page (AD).
- Licence number: 1, on a doctor page (AKT). Provincial or state registration bodies as credential strings: 3 (BYP FRCD(C), SP FCAMPT, OD).
- Awards: 4 (BC "Boise best" images, AKT "Top Dentist" per doctor, AD per-doctor award, OD magazine listing).
- Association logos: 2 (AKT two associations, BD none seen; pilot roofers had seals).
- Social links: 6 (AKT 4 networks incl. Google and Yelp, AD 5 incl. a dead one, BC 2, WD, BD, OD). A personal account as the business social: 1 (WD).
- Newsletter signup: 1 (BC). Cookie banner: 1 (ME).
- Cancellation or no-show policy with amounts: 2 (BC, SP).
- Accessibility note: 1 (SP "our building has stairs").
- "New patients welcome" line: 7.
- Insurance: named insurers 4 (BC lists, ME 28 logos, BD 15 logos + 9 names, AKT "most PPO plans" generic); "accept all insurance" generic 2 (AD, PD courtesy claims); per-service acceptance 1 (BC); government programs 2 (AD CDCP, ME AHC and NIHB).
- Financing provider named: 5 (AKT Sunbit + CareCredit, AD Affirm, ME Affirm, BD CareCredit + Cherry, SS none). Rate claims ("0% APR", "soft credit check"): 3. Payment method logos: 1 (AKT). HSA/FSA line: 2 (BC, BD).
- Booking software named or linked: 7 (AKT CareStack, AD oralhealth.app, SS Fresha, SP Jane, WD dental4.me, BC sked.life, ME shop/book).
- Service area wording: 5 as neighbourhoods served in prose (AD home + contact, SS one service page, AKT "surrounding communities", BYP "across the GTA", pilot roofers as pages). No local-service site had service-area pages.
- Offer: complimentary or no-cost consultation 4 (SS, AD, SP, BYP "free" not seen; BD?), promotion with a discount 1 (ME 15% off), gift cards 1 (BC).
- Community involvement: 3 (PD page + photos, BC heading, WD sponsorship line).

## Evidence: 3. Site-wide blocks (recorded once, inherited by pages)

- Header: logo, nav, phone, one or two buttons (Book, Patient Forms, Portal, Store), sometimes address (PD, BYP, AKT top bar), sometimes a promotion bar (ME). 11.
- Footer: address, phone, hours, social, quick links. Location cards repeated per location (AKT 3). Policy text (BC). Newsletter (BC). Designer credit (BC, AKT). 11.
- Call to action band on every page: 5 (BD, WD, BYP appointments band, SR and NF in the pilot).
- Site-wide form (contact or request) on every page: 3 (AD modal form, WD, SS short form on several pages).
- Featured staff bio block on every page: 1 (SP).
- Review widget on home only: 3 (ME, SP, BD Trustindex).
- Booking modal or sticky bar: 3 (PD utility bar with 6 actions, AD mobile strip Call / Book / Map, AKT top bar).

## Evidence: 4. Sections and their fields

Each section: how many sites used it anywhere, then its fields. "req" = present wherever the section appeared.

### Hero (11)
- Headline: req. Form varies: a tagline (SP, BC, WD), the business name (PD, BYP, BD), a local keyword title (AD, ME), a two-part rotating line (AKT).
- Subhead: 8.
- Buttons: 7 (one 4, two 3: AKT, BYP, ME). None on 4 (PD, SP, BC, OD has a form instead).
- Image: 10 (photo or banner). Video: 1 in the pilot (NF).
- Phone in hero: 2 (BD, SR). Hours in hero: 1 (BD). Form in hero: 2 (OD, NF). Trust strip or pill: 2 (AKT "Accepting New Patients!", SR strip). Rating line directly under the hero: 1 (BYP).
- Reviews strip above the hero: 1 (AD).

### Intro or welcome (9)
Heading + one to three paragraphs, sometimes a button. Carries the "since", neighbourhoods and "new patients welcome" lines.

### Services grid (11)
- Item name: req.
- Link: 9. Image: 6 (ME, SP, PD tiles, NF). Icon: 3 (BD, OD, WD). Summary: 5. Category grouping: 6 (AKT headings with buttons, BYP headings with bullets, SS four tiles, BD five blocks, WD labels, AD four bullets). Price: 0. Duration: 0.
- Sub-kinds seen: linked cards with image (ME, SP), category heading + list (AKT, BYP), tile with description (SS), icon cards (OD), checklist bullets (AD), featured tiles with photos (PD 5).

### Why choose us, values, key points (10)
- Item heading: req. Body: 7. Icon: 4. Image per item: 2 (PD 6 photo cards). Checkmark bullet list variant: 3 (AKT, PD veneers, BD). Mission statement as a labelled sentence: 3.

### Process or what to expect steps (6)
- Step title: req. Description: 5. Number: 2. Photo: 1. Variants: 3-step "how it works" (BC), 4-step treatment journey (BYP), first-visit steps as prose headings (AKT, AD, PD, SP).

### Team (11)
- Person name: req. Name form: full with credentials in the name 5 (AKT, BYP, PD, SS, SP), first name only for staff 5 (BC all, AD hygienists, BD, WD, AKT none).
- Photo: 10 (ME none in text). Role: 9. Credential string: 6 (BYP long formal, OD letters as role, SS BSN RN, SP PT MScPT, AKT in name, WD profile). Bio on the card: 4 (AD excerpt + Read More, SS, PD home feature, OD). Bio on a profile page: 8. Video: 2 (AKT per doctor, PD). Education: 5 on profiles. Memberships or certifications: 4. Awards: 3. Languages per person: 1 (WD). Pronouns: 1 (SP). Licence number: 1 (AKT). Owner or founder flag: 4 (PD, SS, AD, BC). Status note ("maternity leave"): 1 (AD). Join date: 1 (AD). Personal paragraph (family, hobbies): 4 (PD, AKT, SS, AD). Nickname: 1 (AKT). Social link: 1 in the pilot (NF). Grouping by department or role: 4 (BC 4 groups, BD, AKT doctors vs staff, SP by discipline).

### Reviews and testimonials (10)
- Quote: req. Reviewer name: 9 (full 5, first + initial 3, initials 1 SS reviews page, none 1 AD home strip). Star rating: 5 (images 3, "5/5" text 1, emoji 1). Source: 6 (per-review word or icon 3, verified-source notice 3 Trustindex). Date: 1 (SS). Reviewer photo: 3 (widgets). Treatment or service named: 2 (AD video titles, SP in quote). Video testimonial: 3 (PD, AD, AKT doctor videos are not testimonials). Aggregate rating + count in the block: 3 (SP, BD widget, ME), elsewhere 2 (BYP line, ME stats). "Review us" links under the block: 4 (AKT 4 platforms, PD 3, AD, OD).
- Three delivery forms on one site: 1 (PD written page, video page, outbound links).

### Before and after, results, cases (3, all dental)
- Before image + after image: req. Case title or category: 3. Story or treatment description: 3 (PD first-name narrative, BYP problem + treatment pair, WD captions). Patient first name: 1 (PD). Pairing determinable: 2 of 3.

### FAQ (8)
- Question + answer: req. Grouping: 2 (AD by topic, AKT membership-only). Attribution: 1 in the pilot (NF). Count ranges 3 (implant pages) to 40 (NF). Location: page 4, home block 2 (PD, SR), inside a service page 3, inside a plan page 1.

### Stats tiles (5)
- Value + label: req. Empty or placeholder values: 2 (BD "0 +", ME "0 +"). Values that are not numbers ("Countless", a review line as a patient count): 1 (BYP). Typical labels: years, reviews, providers, implants placed, frames, brands.

### Badges, seals, associations (6)
- Image: req. Issuer name in text: 4. Linked out: 2. Types: professional associations (AKT), accreditation seals (pilot roofers), insurer logos (BD, ME: counted under insurance), payment logos (AKT), award images (BC).

### Insurance accepted (5 as a block)
- Generic acceptance line: 5. Named insurers as logos: 2 (ME 28, BD 15). As text list: 3 (BC in-network and out-of-network, BD 9, AKT "most PPO"). Per-service rule: 1 (BC). Government program line: 2. Assignment-of-benefits form link: 1 (ME). "Policy holder paid directly" note: 1 (ME).

### Financing and payment (5)
- Provider name + logo + apply link: 4. Rate or term claim: 3. Payment methods list or logos: 2. HSA/FSA: 2. Membership or package as the alternative: 3.

### Membership plan (2 with detail)
- Plan name, price, period, included items list, eligibility, button: 1 (AKT two plans). Banked-credit membership with discount tiers and an app: 1 (ME). "This is not insurance" note: 1. Vendor credit: 1.

### Contact or request form (11)
- Name, email: req. Phone: 10 (optional on 2). Message: 10.
- New or existing patient: 4 (PD, AD, BD request, AKT portal n/a). Preferred day: 3 (PD, AD, WD). Preferred time: 1 (WD). Preferred contact method: 2 (PD, AD). Preferred provider: 1 (BYP). Treatment of interest: 3 (PD free text, WD select of 9, SP purpose dropdown). How did you hear: 3 (PD, AD, NF). Who referred you: 1 (AD). Consultation yes/no: 1 (WD). Country code picker: 1 (BYP). CAPTCHA notice: 3. Response promise ("within a day or two"): 1 (PD).
- Short form (name, phone, email, comment): 3 (SS, ME, BC none). Long request form: 5.

### Hours and location (11)
- Per-day table 8, grouped line 4; map embed not determinable anywhere; parking 5; multi-location cards 1 (AKT 3 with image, address, phone, text, hours).

### Call to action band (6)
- Headline: req. Button: req. Phone or email inside: 3. Image: 3. Embedded form: 1 (WD). Second button: 2.

### Gallery (4)
- Image: req. Caption: 1 (WD). Lifestyle strip with no captions: 1 (AKT 20 images). Community photos: 2 (PD, BC). Office tour as a page: 5 (counted above).

### Video (5)
- Embedded video: req. Title naming the person or treatment: 2 (AD, AKT). On the hero: 1 (NF).

### Technology or equipment (4)
- Item name: req. Description: 3. Image: 2. Own sub-page per item: 1 (AKT 5). Named brands (iTero, Solea, Trustindex is not equipment): 3.

### Brands or products carried (2)
- Brand name list in prose: 2 (ME frames, SS injectables by brand). Logos: 1 (ME 6). Product tiles with a shop link: 1 (ME). Downloadable spec sheets: pilot roofer only.

### Offer block (5)
- Offer name, description, how to claim (call only, book online, form): 5. Expiry: 0. Price or discount: 2 (ME 15%, BC gift cards). Free consultation length stated: 1 (SP 20 minutes).

### Conditions or symptoms (3)
- Condition name: req. Link to a page: 2 (AKT, ME). Mapped to services: 1 (AKT "Symptoms" routes to services). Prose list only: 1 (SP).

### Patient resources and downloads (6)
- File or page name: req. Grouped by purpose (consent, intake, instructions): 3 (SS consent forms, BYP pre-op and post-op, WD two forms). External portal instead of files: 3 (PD, AKT, BC).

### Policies (3)
- Policy text: req. Cancellation amounts: 2. Late arrival rule: 2. Accessibility: 1. What to wear: 1. Masks: 1. Referral required or not: 2.

### Service page recipe (9 sites with service pages)
Seen on nearly every one, in this order: local title (service + city) 8, tagline or subhead 6, intro paragraph 9, "what it is" 7, "who it is for" or "signs you need it" or "who benefits" 7, benefits list 4, process or what to expect 8, "why choose us" for this service 5, who provides it with credentials 3 (SP, BYP, AD), image per block 6, CTA (book or call) 9, FAQ on the page 3, price 0, related services 2 (AD sub-service links, BYP filter row), candidacy or "is it right for me" 2, brand names 3 (SS, ME, AKT equipment).

## Evidence: 5. Collections the profile implies

From the records above, the data a local service site actually carries:

- **business** (section 2): the required four plus the optional facts, with hours as structured per-day rows that can render grouped, and multiple phones with a purpose each.
- **locations** (1 to many): name, address, phone, text, hours, image, parking and directions notes. AKT proves the many case; every other site is one location that still has the same fields.
- **people**: name, display form, role, department or group, credentials, licence, photo, bio, education, memberships, awards, languages, pronouns, video, owner flag, status note, start year, personal paragraph, specialties, social. Profile page optional per person.
- **service_categories**: name, summary, image, order. 7 of 11 sites have them.
- **services**: name, category, summary, icon, image, local title, tagline, intro, what it is, who it is for, benefits, process steps, why us, providers (relation to people), brands or equipment, FAQs (relation), related services, CTA kind (book, call, consult). No price field in practice, keep it optional.
- **conditions** (optional): name, summary, services that treat it. Two sites had it; it is cheap and it is how patients search.
- **reviews**: quote, reviewer name (with display form), rating, source, date, photo, treatment or service, video URL, featured.
- **cases** (before and after): title, category, story or problem + treatment, before image, after image, patient first name, service. Dental and med spa.
- **faqs**: question, answer, group, service.
- **plans** (membership or package): name, price, period, included items, eligibility, button, not-insurance note. Plus the banked-credit variant as a text block.
- **insurers**: name, logo, network status (in, out), note. And government programs as a text list.
- **financing_providers**: name, logo, apply URL, rate claim, note.
- **downloads** (forms and instructions): name, file or URL, group (intake, consent, pre-op, post-op), service.
- **technologies**: name, description, image, brand, own page flag.
- **offers**: name, description, discount or price, how to claim, service.
- **brands** (optional): name, logo, URL. Optometry and med spa.
- **policies**: text blocks (cancellation, late, accessibility, referral, what to wear).
- **posts**: as today.
- **menus**: as today.

## Evidence: 6. What dental adds on top of the general local model

Everything in section 5, plus these are the dental-specific emphases from the seven dental sites: service categories as the nav structure (6 of 7), a "first visit" page (6 of 7), insurance and financing pages (5 of 7) with named providers, a membership plan with prices (AKT), smile gallery or results (3 of 7), technology pages (3 of 7), sedation and emergency as categories (4 of 7), symptom pages (AKT), video bios per doctor (AKT, PD), a referral page for specialists (BYP), pre-op and post-op instruction pages (BYP), a second-language page (AD), "accepting new patients" as a pill or line (6 of 7), CDCP or government plan lines in Canada (AD), and three locations in one footer (AKT).

## Evidence: 7. Gaps against the pest-control template's data

The pest template (business, pages, services, service_areas, reviews, people, faqs, plans, posts; 14 block types) has no place for: locations as a collection, service categories, conditions, cases (before and after), insurers, financing providers, downloads, technologies, offers, brands, policies, provider-to-service relations, per-person profile pages with education and memberships, structured hours per day, multiple phones with purposes, languages, stats tiles with a filled-or-empty state, a site-wide CTA band or form as a site-level block, and a reviews aggregate (rating + count + source) separate from individual reviews. Service areas are not needed for this profile; neighbourhoods served is a text field on the business.

## Evidence: 8. One-offs (not fields)

Sponsorship line (WD), FAQ attributed to the CEO (NF), nickname on a doctor (AKT), study club page (BYP), Amazon wishlist (BC), prenatal yoga course (BC), assessment quiz as a CTA (ME), "personal shopping visit" (ME), animal chiropractic booking (BC), designer and photographer credits (BC), a hidden keyword-stuffing line (BC), a "Top-Rated Periodontist" heading on a general dentist (PD template leftover).

## Evidence: 9. Open questions for the model

- Hours: structured per-day rows (render grouped when identical) versus a free-text line. Per-day on 8 of 11, and grouped renderings are derivable from rows; free text is not.
- Reviews: keep individual reviews in the site, or render a widget from a connected Google account and keep only featured quotes? Six of eleven used a widget. Both should be possible: featured quotes as entries, aggregate from the Business Profile link.
- Conditions: own collection or a tag on services? Two sites; a collection with a relation is the safer read.
- Locations: a collection even for one-location sites, so hours and address live in one place and multi-location is not a migration later.
