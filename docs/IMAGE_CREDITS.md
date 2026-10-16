# Image credits

Every image in `backend/tools/media-pack/` was taken from [Wikimedia Commons](https://commons.wikimedia.org/) and is either
**public domain** or **CC0**. Public-domain works are credited here as a courtesy; no attribution is legally required for either.
The images are **not bundled in the app**: `backend/tools/apply-media-pack.mjs` uploads them through the admin API into the
database, and the app loads them from there.

## Rules for adding an image

1. Source only from Wikimedia Commons, and read the file page's licence: accept **public domain** (PD-old, PD-India, PD-US, PD-author,
   PDM) or **CC0** only, with an empty *Restrictions* field. No CC BY / CC BY-SA / GFDL, no fair use.
2. Reject anything with a visible watermark, caption or text overlay, and anything from stock-image sites (an earlier set was removed
   because it carried a "pngtree" watermark the project had no licence for).
3. Check that the picture really shows what it is used for, and that it is a respectful depiction.
4. Record it in `manifest.json` (entity, slug, field, file, source URL, title, author, licence, size) and in the table below.

## Images (24)

| Entity | Slug | Source (Commons file page) | Author | Licence | Size |
|---|---|---|---|---|---|
| deity | lakshmi | [Raja Ravi Varma, Goddess Lakshmi, 1896.jpg](https://commons.wikimedia.org/wiki/File:Raja_Ravi_Varma,_Goddess_Lakshmi,_1896.jpg) | Raja Ravi Varma | Public domain | 800×800 |
| deity | shiva | [A version from the Ravi Varma press- "Shankar," c.1910's.jpg](https://commons.wikimedia.org/wiki/File:A_version_from_the_Ravi_Varma_press-_%22Shankar,%22_c.1910%27s.jpg) | ravi varma press | Public domain | 800×800 |
| deity | vishnu | [Vishnu Laxmi and Serpent Anant.jpg](https://commons.wikimedia.org/wiki/File:Vishnu_Laxmi_and_Serpent_Anant.jpg) | Ravi Varma Press (publisher; unsigned) | Public domain | 800×800 |
| deity | ganesh | [Ganesh himself has two wives, Riddhi and Siddhi, as in this domestic pose from the Ravi Varma Press, c.1910.jpg](https://commons.wikimedia.org/wiki/File:Ganesh_himself_has_two_wives,_Riddhi_and_Siddhi,_as_in_this_domestic_pose_from_the_Ravi_Varma_Press,_c.1910.jpg) | ravi varma press | Public domain | 660×660 |
| deity | hanuman | [Hanuman fetches the herb-bearing mountain, in a print from the Ravi Varma Press, 1910's.jpg](https://commons.wikimedia.org/wiki/File:Hanuman_fetches_the_herb-bearing_mountain,_in_a_print_from_the_Ravi_Varma_Press,_1910%27s.jpg) | Ravi Varma Press (publisher; unsigned) | Public domain | 800×800 |
| deity | durga | [Goddess Durga- Early 1900 print Durga is depicted in the Hindu pantheon as a Goddess riding a lion and with many arms, each carrying a weapon to defeat Mahishasura or the buffalo demon.jpg](https://commons.wikimedia.org/wiki/File:Goddess_Durga-_Early_1900_print_Durga_is_depicted_in_the_Hindu_pantheon_as_a_Goddess_riding_a_lion_and_with_many_arms,_each_carrying_a_weapon_to_defeat_Mahishasura_or_the_buffalo_demon.jpg) | Unknown author (early 1900s print) | Public domain | 750×750 |
| deity | krishna | [VenugopalKrishna-CGRamanujam-RaviVarmaPressOleographPrint-IndianPainting 976d929e-9cb4-472a-94a2-9dfd59cff9b2 (1).jpg](https://commons.wikimedia.org/wiki/File:VenugopalKrishna-CGRamanujam-RaviVarmaPressOleographPrint-IndianPainting_976d929e-9cb4-472a-94a2-9dfd59cff9b2_(1).jpg) | Ravi Varma Press Malavi/Lonavla | Public domain | 800×800 |
| deity | shani | [Shani graha.JPG](https://commons.wikimedia.org/wiki/File:Shani_graha.JPG) | E. A. Rodrigues | Public domain | 800×800 |
| temple | kashi | [Benares- The Golden Temple, India, ca. 1915 (IMP-CSCNWW33-OS14-66).jpg](https://commons.wikimedia.org/wiki/File:Benares-_The_Golden_Temple,_India,_ca._1915_(IMP-CSCNWW33-OS14-66).jpg) | Unknown author (hand-coloured lantern slide, c. 1915) | Public domain | 1080×600 |
| temple | siddhivinayak | [Shree Siddhivinayak Mandir.jpg](https://commons.wikimedia.org/wiki/File:Shree_Siddhivinayak_Mandir.jpg) | User:L1CENSET0K1LL | Public domain | 1080×600 |
| temple | meenakshi | [Street & Temple, Madura LCCN2014708750.jpg](https://commons.wikimedia.org/wiki/File:Street_%26_Temple,_Madura_LCCN2014708750.jpg) | Bain News Service, publisher | Public domain | 1080×600 |
| temple | jagannath | [Jagannath Temple - Right View.jpg](https://commons.wikimedia.org/wiki/File:Jagannath_Temple_-_Right_View.jpg) | Amitbalani | CC0 | 1080×600 |
| temple | tirupati | [Tirupati Temple outside.jpg](https://commons.wikimedia.org/wiki/File:Tirupati_Temple_outside.jpg) | Sireesha Kandimalla | CC0 | 956×531 |
| hero | kartik-snan | ['Diya's' on Ganges river on Dev Deepavali festival.jpg](https://commons.wikimedia.org/wiki/File:%27Diya%27s%27_on_Ganges_river_on_Dev_Deepavali_festival.jpg) | Rudolph.A.furtado | CC0 | 1080×520 |
| hero | sample-navratri-pooja | [Durga puja pandal idol.jpg](https://commons.wikimedia.org/wiki/File:Durga_puja_pandal_idol.jpg) | Hizibizbizz | CC0 | 902×434 |
| hero | sample-astrologer | [Jantar Mantar at Jaipur.jpg](https://commons.wikimedia.org/wiki/File:Jantar_Mantar_at_Jaipur.jpg) | Knowledge Seeker | Public domain | 1080×520 |
| hero | sample-coins | [Lotus flower (978659).jpg](https://commons.wikimedia.org/wiki/File:Lotus_flower_(978659).jpg) | Hong Zhang (jennyzhh2008) | CC0 | 1080×520 |
| pooja | archana | [Ganga arti at Haridwar.JPG](https://commons.wikimedia.org/wiki/File:Ganga_arti_at_Haridwar.JPG) | Stuti | Public domain | 1080×600 |
| pooja | abhishek | [Three Shiva Lingas at Vyasa Kasi Temple, Ramnagar Fort, Varanasi, U.P.jpg](https://commons.wikimedia.org/wiki/File:Three_Shiva_Lingas_at_Vyasa_Kasi_Temple,_Ramnagar_Fort,_Varanasi,_U.P.jpg) | K.Venkataramana | CC0 | 1080×600 |
| pooja | sahasranama | [Lotus flower (978659).jpg](https://commons.wikimedia.org/wiki/File:Lotus_flower_(978659).jpg) | Hong Zhang (jennyzhh2008) | CC0 | 1080×600 |
| pooja | modak | [Ganesh chaturthi puja 01.jpg](https://commons.wikimedia.org/wiki/File:Ganesh_chaturthi_puja_01.jpg) | Ashish Suryavanshi858 | CC0 | 1080×600 |
| pooja | deep | [Navratri Kalash Puja.jpg](https://commons.wikimedia.org/wiki/File:Navratri_Kalash_Puja.jpg) | Ashish Suryavanshi858 | CC0 | 1080×600 |
| event | nine-day-japa | [Gayatri japa.jpg](https://commons.wikimedia.org/wiki/File:Gayatri_japa.jpg) | Mrs. S. C. Belnos | Public domain | 1080×600 |
| event | evening-satsang | ['Diya's' on Ganges river on Dev Deepavali festival.jpg](https://commons.wikimedia.org/wiki/File:%27Diya%27s%27_on_Ganges_river_on_Dev_Deepavali_festival.jpg) | Rudolph.A.furtado | CC0 | 1080×600 |

## Points worth a human double-check

* Ravi Varma Press prints (Shiva, Vishnu, Ganesh, Hanuman, Krishna) and the early-1900s Durga and Shani plates are tagged public domain
  on Commons; authorship is a studio or anonymous, so the footing rests on that tag and the publication date.
* Kashi (c.1915 slide) and Meenakshi (Bain News Service) rely on the same Commons tags. The Kashi crop also shows a neighbouring dome.
* Siddhivinayak: the uploader released their own photo as public domain — confirm the release is genuine.
* Modern CC0 photos of murtis and pandals (Durga pandal, Ganesha murti, Jagannath, Tirupati, kalash) are CC0 as photographs; the
  sculptors' rights in the idol designs are not addressed by the CC0 tag.
* Content choices (the Ganesh print shows Riddhi and Siddhi; the Shiva print also shows Parvati, Ganesha and Nandi) are open to swapping.
