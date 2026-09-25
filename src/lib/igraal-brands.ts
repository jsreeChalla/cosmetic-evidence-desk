/**
 * Cosmetics brand/retailer catalogue (PRD section 5).
 *
 * Scraped live from https://fr.igraal.com/codes-promo/cosmetiques (iGraal France's
 * cosmetics coupon directory). One listing on that page, "Groupon", was excluded: it is
 * a general multi-category deals marketplace, not a cosmetics brand or retailer, which
 * keeps this catalogue at the PRD's ~56-brand scope.
 *
 * `searchName` is only set when the iGraal label is an abbreviation or informal name
 * that would produce weaker search results than the brand's full official trading name
 * (PRD 7.1, e.g. Kiko -> "KIKO Milano"). Callers should prefer `searchName ?? name` when
 * building search queries.
 *
 * `website` is the brand's own official domain (bare, no scheme/www — see
 * src/lib/brand-logo.ts, which derives a favicon/logo image from it, and BrandHeader,
 * which links out to it). Verified via DNS resolution + HTTP redirect-following for the
 * smaller/ambiguous brands; well-known global brands were filled from general knowledge.
 * A few names collide with unrelated companies of the same name (see the anti-hallucination
 * `sourceMentionsToken` guard in research.server.ts, built after "Blissim" pulled in results
 * about the unrelated US brand "Bliss") — double-check before trusting a domain blindly if a
 * brand's evidence ever looks off-topic.
 */

import type { Vertical } from './schemas'

export interface BrandCatalogEntry {
  id: string
  name: string
  searchName?: string
  storeUrl: string
  website?: string
  // Which claim-category set applies to this brand (schemas.ts's
  // VERTICAL_CATEGORIES) and which vertical-specific search topics
  // research.server.ts runs for it. Omitted entries default to 'cosmetics' —
  // the original catalogue below predates the multi-vertical extension.
  vertical?: Vertical
}

export const IGRAAL_COSMETICS_BRANDS: Array<BrandCatalogEntry> = [
  { id: 'armani-beauty', name: 'Armani Beauty', storeUrl: 'https://fr.igraal.com/codes-promo/armani-beauty', website: 'armanibeauty.com' },
  { id: 'aroma-zone', name: 'Aroma-zone', searchName: 'Aroma-Zone', storeUrl: 'https://fr.igraal.com/codes-promo/aroma-zone', website: 'aroma-zone.com' },
  { id: 'asambeauty', name: 'Asambeauty', storeUrl: 'https://fr.igraal.com/codes-promo/asambeauty', website: 'asambeauty.com' },
  { id: 'beaute-privee', name: 'Beauté Privée', storeUrl: 'https://fr.igraal.com/codes-promo/beaute-privee', website: 'beauteprivee.fr' },
  { id: 'beauty-coiffure', name: 'Beauty Coiffure', storeUrl: 'https://fr.igraal.com/codes-promo/beauty-coiffure', website: 'beautycoiffure.com' },
  { id: 'beauty-success', name: 'Beauty success', searchName: 'Beauty Success', storeUrl: 'https://fr.igraal.com/codes-promo/beauty-success', website: 'beautysuccess.fr' },
  { id: 'blissim', name: 'Blissim', storeUrl: 'https://fr.igraal.com/codes-promo/blissim', website: 'blissim.fr' },
  { id: 'boticinal', name: 'Boticinal', storeUrl: 'https://fr.igraal.com/codes-promo/boticinal', website: 'boticinal.com' },
  { id: 'christophe-robin', name: 'Christophe Robin', storeUrl: 'https://fr.igraal.com/codes-promo/christophe-robin', website: 'christophe-robin.fr' },
  { id: 'clarins', name: 'Clarins', storeUrl: 'https://fr.igraal.com/codes-promo/clarins', website: 'clarins.com' },
  { id: 'clinique', name: 'Clinique', storeUrl: 'https://fr.igraal.com/codes-promo/clinique', website: 'clinique.com' },
  { id: 'cult-beauty', name: 'Cult Beauty', storeUrl: 'https://fr.igraal.com/codes-promo/cult-beauty', website: 'cultbeauty.co.uk' },
  { id: 'dr-pierre-ricaud', name: 'Dr Pierre Ricaud', storeUrl: 'https://fr.igraal.com/codes-promo/dr-pierre-ricaud/code-avantage', website: 'ricaud.com' },
  { id: 'erborian', name: 'Erborian', storeUrl: 'https://fr.igraal.com/codes-promo/erborian', website: 'erborian.com' },
  { id: 'fleurance-nature', name: 'Fleurance Nature', storeUrl: 'https://fr.igraal.com/codes-promo/fleurance-nature/code-privilege', website: 'fleurancenature.fr' },
  { id: 'fragonard', name: 'Fragonard', storeUrl: 'https://fr.igraal.com/codes-promo/fragonard', website: 'fragonard.com' },
  { id: 'galeries-lafayette', name: 'Galeries Lafayette', storeUrl: 'https://fr.igraal.com/codes-promo/galeries-lafayette', website: 'galerieslafayette.com' },
  { id: 'ghd', name: 'Ghd', searchName: 'ghd (Good Hair Day)', storeUrl: 'https://fr.igraal.com/codes-promo/ghd', website: 'ghdhair.com' },
  { id: 'glowria', name: 'Glowria', storeUrl: 'https://fr.igraal.com/codes-promo/glowria', website: 'glowria.com' },
  { id: 'greenweez', name: 'Greenweez', storeUrl: 'https://fr.igraal.com/codes-promo/greenweez/code-promo', website: 'greenweez.com' },
  { id: 'hairburst', name: 'Hairburst', storeUrl: 'https://fr.igraal.com/codes-promo/hairburst', website: 'hairburst.com' },
  { id: 'kiehls', name: "Kiehl's", storeUrl: 'https://fr.igraal.com/codes-promo/kiehls', website: 'kiehls.com' },
  { id: 'kiko', name: 'Kiko', searchName: 'KIKO Milano', storeUrl: 'https://fr.igraal.com/codes-promo/kiko', website: 'kikocosmetics.com' },
  { id: 'loccitane', name: "L'Occitane", searchName: "L'Occitane en Provence", storeUrl: 'https://fr.igraal.com/codes-promo/loccitane', website: 'loccitane.com' },
  { id: 'loreal-paris', name: "L'Oréal Paris", storeUrl: 'https://fr.igraal.com/codes-promo/loreal-paris', website: 'lorealparis.com' },
  { id: 'laifen', name: 'Laifen', storeUrl: 'https://fr.igraal.com/codes-promo/laifen', website: 'laifentech.com' },
  { id: 'lancome', name: 'Lancôme', storeUrl: 'https://fr.igraal.com/codes-promo/lancome', website: 'lancome.com' },
  { id: 'lookfantastic', name: 'LOOKFANTASTIC', storeUrl: 'https://fr.igraal.com/codes-promo/look-fantastic', website: 'lookfantastic.com' },
  { id: 'lovaskin', name: 'Lovaskin', storeUrl: 'https://fr.igraal.com/codes-promo/lovaskin', website: 'lovaskin.eu' },
  { id: 'mac-cosmetics', name: 'MAC Cosmetics', searchName: 'M·A·C Cosmetics', storeUrl: 'https://fr.igraal.com/codes-promo/mac-cosmetics', website: 'maccosmetics.com' },
  { id: 'make-up-for-ever', name: 'Make up for ever', searchName: 'Make Up For Ever', storeUrl: 'https://fr.igraal.com/codes-promo/make-up-for-ever', website: 'makeupforever.com' },
  { id: 'marionnaud', name: 'Marionnaud', storeUrl: 'https://fr.igraal.com/codes-promo/marionnaud/bon-de-reduction', website: 'marionnaud.com' },
  { id: 'merit-beauty', name: 'MERIT Beauty', storeUrl: 'https://fr.igraal.com/codes-promo/merit-beauty', website: 'meritbeauty.com' },
  { id: 'momcozy', name: 'Momcozy', storeUrl: 'https://fr.igraal.com/codes-promo/momcozy', website: 'momcozy.com' },
  { id: 'musc-intime', name: 'Musc Intime', storeUrl: 'https://fr.igraal.com/codes-promo/musc-intime', website: 'muscintime.fr' },
  { id: 'newpharma', name: 'Newpharma', storeUrl: 'https://fr.igraal.com/codes-promo/newpharma', website: 'newpharma.fr' },
  { id: 'niche-beauty', name: 'Niche Beauty', storeUrl: 'https://fr.igraal.com/codes-promo/niche-beauty', website: 'niche-beauty.com' },
  { id: 'nocibe', name: 'Nocibé', storeUrl: 'https://fr.igraal.com/codes-promo/nocibe/code-avantage', website: 'nocibe.fr' },
  { id: 'notino', name: 'Notino', storeUrl: 'https://fr.igraal.com/codes-promo/notino', website: 'notino.com' },
  { id: 'nuxe', name: 'Nuxe', storeUrl: 'https://fr.igraal.com/codes-promo/nuxe', website: 'nuxe.com' },
  { id: 'nyx-professional-makeup', name: 'NYX Professional Makeup', storeUrl: 'https://fr.igraal.com/codes-promo/nyx', website: 'nyxcosmetics.com' },
  { id: 'parfumdreams', name: 'Parfumdreams', storeUrl: 'https://fr.igraal.com/codes-promo/parfumdreams', website: 'parfumdreams.de' },
  { id: 'parfums-moins-cher', name: 'Parfums moins cher', storeUrl: 'https://fr.igraal.com/codes-promo/parfums-moins-cher', website: 'parfums-moins-cher.com' },
  { id: 'pascal-coste', name: 'Pascal Coste', storeUrl: 'https://fr.igraal.com/codes-promo/pascal-coste', website: 'pascal-coste.com' },
  { id: 'pinup-secret', name: 'Pinup-secret', searchName: 'Pin-Up Secret', storeUrl: 'https://fr.igraal.com/codes-promo/pinup-secret', website: 'pin-up-secret.com' },
  { id: 'printemps', name: 'Printemps', storeUrl: 'https://fr.igraal.com/codes-promo/printemps', website: 'printemps.com' },
  { id: 'revolution-beauty', name: 'Revolution Beauty', storeUrl: 'https://fr.igraal.com/codes-promo/revolution-beauty', website: 'revolutionbeauty.com' },
  { id: 'rituals', name: 'Rituals', storeUrl: 'https://fr.igraal.com/codes-promo/rituals', website: 'rituals.com' },
  { id: 'sephora', name: 'Sephora', storeUrl: 'https://fr.igraal.com/codes-promo/sephora/offre-promotionnelle', website: 'sephora.fr' },
  { id: 'seventyone', name: 'SeventyOne', storeUrl: 'https://fr.igraal.com/codes-promo/seventyone', website: 'seventyone.fr' },
  { id: 'skinceuticals', name: 'SkinCeuticals', storeUrl: 'https://fr.igraal.com/codes-promo/skinceuticals', website: 'skinceuticals.com' },
  { id: 'space-nk', name: 'Space NK', storeUrl: 'https://fr.igraal.com/codes-promo/space-nk', website: 'spacenk.com' },
  { id: 'the-ayurveda-experience', name: 'The Ayurveda Experience', storeUrl: 'https://fr.igraal.com/codes-promo/theayurvedaexperience', website: 'theayurvedaexperience.com' },
  { id: 'weleda', name: 'Weleda', storeUrl: 'https://fr.igraal.com/codes-promo/weleda', website: 'weleda.com' },
  { id: 'yesstyle', name: 'YesStyle', storeUrl: 'https://fr.igraal.com/codes-promo/yesstyle', website: 'yesstyle.com' },
  { id: 'yves-rocher', name: 'Yves Rocher', storeUrl: 'https://fr.igraal.com/codes-promo/yves-rocher/code-privilege', website: 'yves-rocher.com' },
]

/**
 * First non-cosmetics verticals (extending the catalogue beyond PRD section 5's
 * original cosmetics-only scope). Three brands per vertical, picked from
 * fr.igraal.com's own category pages (`/codes-promo/modevetements`,
 * `/codes-promo/high-tech`, `/codes-promo/alimentation`) the same way the
 * cosmetics catalogue was sourced.
 */
export const IGRAAL_FASHION_BRANDS: Array<BrandCatalogEntry> = [
  { id: 'adidas', name: 'Adidas', storeUrl: 'https://fr.igraal.com/codes-promo/adidas/bon-de-reduction', website: 'adidas.com', vertical: 'fashion' },
  { id: 'nike', name: 'Nike', storeUrl: 'https://fr.igraal.com/codes-promo/nike/code-promotionnel', website: 'nike.com', vertical: 'fashion' },
  { id: 'hm', name: 'H&M', searchName: 'H&M', storeUrl: 'https://fr.igraal.com/codes-promo/hm', website: 'hm.com', vertical: 'fashion' },
]

export const IGRAAL_ELECTRONICS_BRANDS: Array<BrandCatalogEntry> = [
  { id: 'dell', name: 'Dell', storeUrl: 'https://fr.igraal.com/codes-promo/dell/code-de-reduction', website: 'dell.com', vertical: 'electronics' },
  { id: 'hewlett-packard', name: 'HP', searchName: 'Hewlett-Packard (HP)', storeUrl: 'https://fr.igraal.com/codes-promo/hewlett-packard/code-promo', website: 'hp.com', vertical: 'electronics' },
  { id: 'lg', name: 'LG', storeUrl: 'https://fr.igraal.com/codes-promo/lg', website: 'lg.com', vertical: 'electronics' },
]

export const IGRAAL_FOOD_BRANDS: Array<BrandCatalogEntry> = [
  { id: 'lidl', name: 'Lidl', storeUrl: 'https://fr.igraal.com/codes-promo/lidl', website: 'lidl.fr', vertical: 'food' },
  { id: 'hellofresh-fr', name: 'HelloFresh', storeUrl: 'https://fr.igraal.com/codes-promo/hellofresh-fr', website: 'hellofresh.fr', vertical: 'food' },
  { id: 'nescafe-dolce-gusto', name: 'Nescafé Dolce Gusto', storeUrl: 'https://fr.igraal.com/codes-promo/nescafe-dolce-gusto', website: 'dolce-gusto.com', vertical: 'food' },
]

// Full multi-vertical catalogue. IGRAAL_COSMETICS_BRANDS is kept as its own
// export too since its entries omit `vertical` (implicitly 'cosmetics') and
// some call sites only ever care about that one vertical.
export const ALL_RETAILER_BRANDS: Array<BrandCatalogEntry> = [
  ...IGRAAL_COSMETICS_BRANDS,
  ...IGRAAL_FASHION_BRANDS,
  ...IGRAAL_ELECTRONICS_BRANDS,
  ...IGRAAL_FOOD_BRANDS,
]
