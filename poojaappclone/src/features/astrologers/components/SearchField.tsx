import { Field } from '@/components/ui';
import { useLanguage } from '@/i18n';

export function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  return (
    <Field
      icon="search"
      label={t('astro_search_label')}
      placeholder={t('astro_search_ph')}
      value={value}
      onChangeText={onChange}
      returnKeyType="search"
      autoCorrect={false}
    />
  );
}
