# Deity artwork — provenance

Every image here is a **public-domain** oleograph/lithograph from the **Raja
Ravi Varma Press**, retrieved from Wikimedia Commons. Raja Ravi Varma died in
1906, so the works are long out of copyright (`PD-old`), and Commons records
each as Public domain.

These replaced watermarked stock renders ("pngtree" was visible across the
Shiva image on the Darshan and Pooja screens) that the project had no licence
to ship.

Public domain imposes no attribution requirement. This file exists anyway so
the next person can verify the provenance rather than take it on trust.

| file | source file on Wikimedia Commons | credited | licence |
| ---- | -------------------------------- | -------- | ------- |
| `shiva.jpg` | Ravi Varma-Descent of Ganga.jpg | Raja Ravi Varma | Public domain |
| `vishnu.jpg` | Raja Ravi Varma, Seshanarayana (Oleographic print).jpg | Raja Ravi Varma | Public domain |
| `ganesh.jpg` | Ganapati1.jpg | Raja Ravi Varma | Public domain |
| `durga.jpg` | Mahishasura-mardini.jpg | Ravi Varma Press | Public domain |
| `lakshmi.jpg` | Raja Ravi Varma, Goddess Lakshmi, 1896.jpg | Raja Ravi Varma | Public domain |
| `krishna.jpg` | Yashoda with Krishna, Raja Ravi Varma.jpg | Raja Ravi Varma | Public domain |
| `shani.jpg` | The inauspicious Shanidev, or Saturn, also has a bull for his vehicle.jpg | Ravi Varma Press | Public domain |
| `hanuman.jpg` | Hanuman fetches the herb-bearing mountain, in a print from the Ravi Varma Press, 1910's.jpg | Ravi Varma Press (author not recorded) | Public domain |

Each page is at `https://commons.wikimedia.org/wiki/File:<source file>`.

## Replacing one

Keep the filename (`<deity id>.jpg`) — `src/constants/deity-images.ts` maps by
it. JPEG at roughly 1000px on the long edge; the whole folder should stay
around 2 MB, since it all ships inside the app.

Artwork uploaded through the admin dashboard **overrides** these at runtime
(`useContent().deityArt(id)`). What is here is the offline fallback.
