import { common } from './common';
import { home } from './home';
import { pooja } from './pooja';
import { bhajan } from './bhajan';
import { temples } from './temples';
import { booking } from './booking';
import { chadhava } from './chadhava';
import { journal } from './journal';
import { darshan } from './darshan';
import { events } from './events';
import { profile } from './profile';
import { help } from './help';
import { auth } from './auth';
import { coins } from './coins';
import { astrologer } from './astrologer';
import { homeLayout } from './home-layout';
import { homeV2 } from './home-v2';
import { search } from './search';
import { poojaSeva } from './pooja-seva';
import { chadhavaSeva } from './chadhava-seva';
import { appPolicy } from './app-policy';
import { accountBlocked } from './account-blocked';
import { bhajanProfile } from './bhajan-profile';

/** Every English string, merged from its namespaces. */
export const en = {
  ...common,
  ...home,
  ...pooja,
  ...bhajan,
  ...temples,
  ...booking,
  ...chadhava,
  ...journal,
  ...darshan,
  ...events,
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
  ...search,
  ...appPolicy,
  ...accountBlocked,
} as const;
