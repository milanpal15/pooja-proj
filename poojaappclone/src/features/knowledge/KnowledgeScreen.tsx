import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { Card, NoContent, Screen, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useAdmin } from '@/providers/admin';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { DeityChips } from './components/DeityChips';
import { DeityHero } from './components/DeityHero';
import {
  FactsSection,
  FestivalsSection,
  OfferingsSection,
  ScripturesSection,
} from './components/LoreSections';
import { MantraCard } from './components/MantraCard';
import { NextSteps } from './components/NextSteps';
import { useKnowledge } from './hooks/use-knowledge';

/**
 * Knowledge of the Gods — the destination for the deity cards on Home.
 *
 * Those cards used to open `/pooja`, the gesture aarti, which answered a
 * question nobody asked: tapping "learn about Shiva" started a ritual instead
 * of explaining anything. This is the reading screen they were pointing at.
 *
 * It ends where a devotee would want to go next — the aarti for this deity,
 * and its scriptures — so the screen informs rather than dead-ends.
 */
export function KnowledgeScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { flags } = useAdmin();
  const hi = lang === 'hi';
  const { deity: param } = useLocalSearchParams<{ deity?: string }>();
  const { id, setId, deity, lore, art, deityList, knowledgeIds } = useKnowledge(param);

  // Every hook has run. Two ways to have nothing: no deities at all, or a
  // deity whose lore has not been written yet. The bundled literal made the
  // second impossible, so nothing downstream expects it.
  if (!deity || !lore) {
    return (
      <Screen tabBar={false}>
        <AppBar title={hi ? 'देवों का ज्ञान' : 'Knowledge of the Gods'} />
        <NoContent hi={hi} />
      </Screen>
    );
  }

  return (
    <Screen tabBar={false}>
      <AppBar
        title={hi ? 'देवों का ज्ञान' : 'Knowledge of the Gods'}
        subtitle={(hi ? deity.name : deity.title)?.toUpperCase()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <DeityChips
          hi={hi}
          ids={knowledgeIds}
          deityList={deityList}
          selectedId={id}
          onSelect={setId}
        />

        {art && (
          <DeityHero
            art={art}
            name={hi ? deity.name : deity.title}
            epithet={hi ? lore.epithetHi : lore.epithet}
          />
        )}

        <MantraCard hi={hi} mantra={deity.mantra} />

        <Card>
          <Type v="bodyMd">{hi ? lore.aboutHi : lore.about}</Type>
        </Card>

        <FactsSection hi={hi} lore={lore} />
        <ScripturesSection hi={hi} lore={lore} />
        <FestivalsSection hi={hi} lore={lore} />
        <OfferingsSection hi={hi} deity={deity} />

        <NextSteps
          showPooja={!!flags.virtualPooja}
          showBhajan={!!flags.bhajan}
          poojaLabel={t('feat_virtual_pooja')}
          bhajanLabel={t('feat_bhajans')}
          onPooja={() => router.push({ pathname: '/pooja', params: { deity: id } })}
          onBhajan={() => router.push('/bhajan')}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
});
