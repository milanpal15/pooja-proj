# Artwork and demo audio

Neither ships in the app. Both live in MongoDB (GridFS) and are served by
`/uploads/<id>`, so the temple replaces them from the dashboard without a
release. This file records where the seeded set came from, because
"public domain" is a claim that should be checkable.

## Deity artwork

Chromolithographs and oleographs, chiefly Raja Ravi Varma and the Ravi Varma
Press. Ravi Varma died in 1906, so the works are long out of copyright; each
file's licence was read from the Wikimedia Commons API at import rather than
assumed, and anything not reported as public domain was skipped. Faithful
photographic reproductions of two-dimensional public-domain art carry no new
copyright.

Imported at 900px wide — enough for a phone, and the database is also the
storage budget (Atlas M0 is 512MB for documents and media together).

| Deity | Work | Artist | Licence |
|---|---|---|---|
| `shiva` | [An Oleograph of Shiva, Parvati and Nandi by Raja Ravi Varma](https://commons.wikimedia.org/wiki/File%3AAn%20Oleograph%20of%20Shiva%2C%20Parvati%20and%20Nandi%20by%20Raja%20Ravi%20Varma.jpg) | Raja Ravi Varma (1848-1906) | Public domain |
| `shani` | [The inauspicious Shanidev, or Saturn, also has a bull for his vehicle](https://commons.wikimedia.org/wiki/File%3AThe%20inauspicious%20Shanidev%2C%20or%20Saturn%2C%20also%20has%20a%20bull%20for%20his%20vehicle.jpg) | Ravi Varma Press | Public domain |
| `vishnu` | [Raja Ravi Varma, Seshanarayana (Oleographic print)](https://commons.wikimedia.org/wiki/File%3ARaja%20Ravi%20Varma%2C%20Seshanarayana%20(Oleographic%20print).jpg) | Raja Ravi Varma | Public domain |
| `ganesh` | [Ganesh on his vahana, a mouse or rat](https://commons.wikimedia.org/wiki/File%3AGanesh%20on%20his%20vahana%2C%20a%20mouse%20or%20rat.jpg) | unknown | Public domain |
| `hanuman` | [HANUMAN LIFTS HILL](https://commons.wikimedia.org/wiki/File%3AHANUMAN%20LIFTS%20HILL.jpg) | Raja Ravi Varma | Public domain |
| `durga` | [Mahishasura-mardini](https://commons.wikimedia.org/wiki/File%3AMahishasura-mardini.jpg) | Ravi Varma Press | Public domain |
| `lakshmi` | [Raja Ravi Varma, Goddess Lakshmi, 1896](https://commons.wikimedia.org/wiki/File%3ARaja%20Ravi%20Varma%2C%20Goddess%20Lakshmi%2C%201896.jpg) | Raja Ravi Varma | Public domain |
| `krishna` | [VenugopalKrishna-CGRamanujam-RaviVarmaPressOleographPrint-IndianPainting 976d929e-9cb4-472a-94a2-9dfd59cff9b2 (1)](https://commons.wikimedia.org/wiki/File%3AVenugopalKrishna-CGRamanujam-RaviVarmaPressOleographPrint-IndianPainting%20976d929e-9cb4-472a-94a2-9dfd59cff9b2%20(1).jpg) | Ravi Varma Press Malavi/Lonavla | Public domain |

## Demo audio

Synthesised, not sourced — a placeholder recording has to be unambiguously
free to ship, and making it is the only way to be certain. Each track is a
tanpura-style drone with temple-bell strikes and a simple pentatonic line,
at a different root pitch per aarti so they are told apart. 96kbps mono MP3.

They exist so the player, the seek bar and the alarm have something real to
play. Replace them with the temple's own recordings from the dashboard.
