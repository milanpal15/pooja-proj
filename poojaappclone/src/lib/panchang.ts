import { MhahPanchang } from 'mhah-panchang';
import * as SunCalc from 'suncalc';

/**
 * The daily panchang, computed on the device.
 *
 * Computed rather than fetched or authored, because every element here is
 * deterministic astronomy — tithi is the Moon–Sun elongation in twelfths,
 * nakshatra is the Moon's sidereal longitude in twenty-sevenths, and the
 * inauspicious periods are fixed divisions of the day between sunrise and
 * sunset. None of it is opinion, so none of it needs a backend, and the
 * screen works with no network at all.
 *
 * `mhah-panchang` supplies tithi / nakshatra / yoga / karana / masa; its
 * output was cross-checked against an independent ephemeris calculation
 * (`astronomy-engine`) before being relied on here, and agreed exactly.
 *
 * ⚠️ **Regional variation is real.** Panchang differs between the Smārta and
 * Vaishnava traditions and between amānta and pūrṇimānta month reckonings,
 * and observed sunrise at a temple can differ from the computed one. The
 * screen says where its numbers come from rather than presenting them as the
 * single authority.
 */

export type Period = { start: Date; end: Date };

/**
 * Varanasi, when nothing better is available.
 *
 * Not content standing in for content: a panchang is computed from a
 * latitude and longitude, so there has to be a pair. The dashboard's first
 * temple is preferred where a screen has one, and the device's own location
 * beats both.
 */
export const DEFAULT_PLACE = { lat: 25.3109, lng: 83.0107, label: 'Varanasi, Uttar Pradesh' };

export type Panchang = {
  date: Date;
  /** Weekday in the Hindu reckoning. */
  vara: string;
  varaHi: string;
  tithi: string;
  tithiHi: string;
  paksha: string;
  pakshaHi: string;
  nakshatra: string;
  nakshatraHi: string;
  yoga: string;
  yogaHi: string;
  karana: string;
  karanaHi: string;
  masa: string;
  masaHi: string;
  ritu: string;
  rituHi: string;
  sunrise: Date | null;
  sunset: Date | null;
  /** Inauspicious windows, by convention an eighth of the daylight each. */
  rahuKaal: Period | null;
  yamaganda: Period | null;
  gulika: Period | null;
  /** The one reliably auspicious window: the eighth muhurta, around midday. */
  abhijit: Period | null;
};

const VARA = ['Ravivara', 'Somavara', 'Mangalavara', 'Budhavara', 'Guruvara', 'Shukravara', 'Shanivara'];
const VARA_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

/*
 * Which eighth of the daylight each period falls in, indexed by weekday
 * (0 = Sunday). These orderings are traditional and fixed; they are not
 * derived from anything, which is why they are a table rather than a formula.
 */
const RAHU_SLOT = [8, 2, 7, 5, 6, 4, 3];
const YAMA_SLOT = [5, 4, 3, 2, 1, 7, 6];
const GULIKA_SLOT = [7, 6, 5, 4, 3, 2, 1];

/** The nth eighth of the span between sunrise and sunset. */
function daylightSlot(sunrise: Date, sunset: Date, slot: number): Period {
  const part = (sunset.getTime() - sunrise.getTime()) / 8;
  const start = new Date(sunrise.getTime() + part * (slot - 1));
  return { start, end: new Date(start.getTime() + part) };
}

/*
 * Devanagari names, indexed by the library's own `ino`.
 *
 * `mhah-panchang` returns three name fields and none of them suits a Hindi
 * UI: `name` is **Odia** (ଦଶମୀ), `name_en_IN` is a Latin transliteration,
 * and `Ritu` has no `name_en_IN` at all. Falling back to `name` put Odia
 * script on a Hindi screen, so these tables supply the Devanagari and
 * `nameOf` never reaches for `name` again.
 */
const TITHI_HI = ['प्रतिपदा','द्वितीया','तृतीया','चतुर्थी','पंचमी','षष्ठी','सप्तमी','अष्टमी','नवमी','दशमी','एकादशी','द्वादशी','त्रयोदशी','चतुर्दशी','पूर्णिमा','प्रतिपदा','द्वितीया','तृतीया','चतुर्थी','पंचमी','षष्ठी','सप्तमी','अष्टमी','नवमी','दशमी','एकादशी','द्वादशी','त्रयोदशी','चतुर्दशी','अमावस्या'];
const PAKSHA_HI = ['शुक्ल', 'कृष्ण'];
const NAKSHATRA_HI = ['अश्विनी','भरणी','कृत्तिका','रोहिणी','मृगशिरा','आर्द्रा','पुनर्वसु','पुष्य','आश्लेषा','मघा','पूर्वाफाल्गुनी','उत्तराफाल्गुनी','हस्त','चित्रा','स्वाति','विशाखा','अनुराधा','ज्येष्ठा','मूल','पूर्वाषाढ़ा','उत्तराषाढ़ा','श्रवण','धनिष्ठा','शतभिषा','पूर्वाभाद्रपद','उत्तराभाद्रपद','रेवती'];
const YOGA_HI = ['विष्कम्भ','प्रीति','आयुष्मान','सौभाग्य','शोभन','अतिगण्ड','सुकर्मा','धृति','शूल','गण्ड','वृद्धि','ध्रुव','व्याघात','हर्षण','वज्र','सिद्धि','व्यतीपात','वरीयान','परिघ','शिव','सिद्ध','साध्य','शुभ','शुक्ल','ब्रह्म','ऐन्द्र','वैधृति'];
const KARANA_HI = ['बव','बालव','कौलव','तैतिल','गर','वणिज','विष्टि','शकुनि','चतुष्पाद','नाग','किंस्तुघ्न'];
const MASA_HI = ['चैत्र','वैशाख','ज्येष्ठ','आषाढ़','श्रावण','भाद्रपद','आश्विन','कार्तिक','मार्गशीर्ष','पौष','माघ','फाल्गुन'];
const RITU_EN = ['Vasanta', 'Grishma', 'Varsha', 'Sharad', 'Hemanta', 'Shishira'];
const RITU_HI = ['वसन्त', 'ग्रीष्म', 'वर्षा', 'शरद', 'हेमन्त', 'शिशिर'];

type LibName = { ino?: number; name_en_IN?: string; name_en_UK?: string };

/**
 * English name for a library value. Never `name` — that field is Odia.
 * Returns '' rather than guessing when the library gives nothing usable.
 */
function nameOf(v: unknown, table?: string[]): string {
  if (!v || typeof v !== 'object') return '';
  const o = v as LibName;
  if (table && typeof o.ino === 'number' && table[o.ino]) return table[o.ino];
  return o.name_en_IN ?? o.name_en_UK ?? '';
}

/** Devanagari name by index, '' when the index is out of range. */
function hindiOf(v: unknown, table: string[]): string {
  if (!v || typeof v !== 'object') return '';
  const i = (v as LibName).ino;
  return typeof i === 'number' ? (table[i] ?? '') : '';
}

export function computePanchang(date: Date, lat: number, lng: number): Panchang {
  const cal = new MhahPanchang().calendar(date, lat, lng) as Record<string, unknown>;

  // SunCalc returns Invalid Date inside the polar circles; guard rather than
  // propagate NaN into every downstream time.
  const times = SunCalc.getTimes(date, lat, lng);
  const ok = (d: Date | null | undefined) => (d && !Number.isNaN(d.getTime()) ? d : null);
  const sunrise = ok(times.sunrise);
  const sunset = ok(times.sunset);

  const dow = date.getDay();
  const slots =
    sunrise && sunset
      ? {
          rahuKaal: daylightSlot(sunrise, sunset, RAHU_SLOT[dow]),
          yamaganda: daylightSlot(sunrise, sunset, YAMA_SLOT[dow]),
          gulika: daylightSlot(sunrise, sunset, GULIKA_SLOT[dow]),
          // Abhijit is the eighth of fifteen muhurtas, i.e. centred on solar
          // noon and running 1/15th of the daylight.
          abhijit: (() => {
            const noon = (sunrise.getTime() + sunset.getTime()) / 2;
            const half = (sunset.getTime() - sunrise.getTime()) / 30;
            return { start: new Date(noon - half), end: new Date(noon + half) };
          })(),
        }
      : { rahuKaal: null, yamaganda: null, gulika: null, abhijit: null };

  return {
    date,
    vara: VARA[dow],
    varaHi: VARA_HI[dow],
    tithi: nameOf(cal.Tithi),
    tithiHi: hindiOf(cal.Tithi, TITHI_HI),
    paksha: nameOf(cal.Paksha),
    pakshaHi: hindiOf(cal.Paksha, PAKSHA_HI),
    nakshatra: nameOf(cal.Nakshatra),
    nakshatraHi: hindiOf(cal.Nakshatra, NAKSHATRA_HI),
    yoga: nameOf(cal.Yoga),
    yogaHi: hindiOf(cal.Yoga, YOGA_HI),
    karana: nameOf(cal.Karna),
    karanaHi: hindiOf(cal.Karna, KARANA_HI),
    masa: nameOf(cal.Masa),
    masaHi: hindiOf(cal.Masa, MASA_HI),
    // Ritu is the one with no `name_en_IN`, hence an English table too.
    ritu: nameOf(cal.Ritu, RITU_EN),
    rituHi: hindiOf(cal.Ritu, RITU_HI),
    sunrise,
    sunset,
    ...slots,
  };
}

/** `6:12 AM`, in the devotee's locale. */
export function clock(d: Date | null, hi: boolean): string {
  if (!d) return '—';
  return d.toLocaleTimeString(hi ? 'hi-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function periodText(p: Period | null, hi: boolean): string {
  return p ? `${clock(p.start, hi)} – ${clock(p.end, hi)}` : '—';
}
