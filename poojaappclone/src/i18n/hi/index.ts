import { common } from './common';
import { home } from './home';
import { pooja } from './pooja';
import { bhajan } from './bhajan';
import { temples } from './temples';
import { booking } from './booking';
import { chadhava } from './chadhava';
import { journal } from './journal';
import { darshan } from './darshan';
import { profile } from './profile';
import { help } from './help';
import { auth } from './auth';
import { coins } from './coins';
import { astrologer } from './astrologer';
import { homeLayout } from './home-layout';
import { homeV2 } from './home-v2';
import { poojaSeva } from './pooja-seva';
import { chadhavaSeva } from './chadhava-seva';
import { bhajanProfile } from './bhajan-profile';

/** Every Hindi string, merged from its namespaces. */
export const hi = {
  ...common,
  ...home,
  ...pooja,
  ...bhajan,
  ...temples,
  ...booking,
  ...chadhava,
  ...journal,
  ...darshan,
  ...profile,
  ...help,
  ...auth,
  ...coins,
  ...astrologer,
  ...poojaSeva,
  ...chadhavaSeva,
  ...bhajanProfile,
  ...homeLayout,
  ...homeV2,
} as const;
