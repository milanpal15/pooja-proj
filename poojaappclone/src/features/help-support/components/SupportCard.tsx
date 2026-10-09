import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

/** Devotee Support Hero Card */
export function SupportCard({
  hi,
  title,
  hours,
  phone,
  email,
  hasSupport,
  onCall,
  onEmail,
}: {
  hi: boolean;
  title: string;
  hours: string;
  phone: string;
  email: string;
  hasSupport: boolean;
  onCall: () => void;
  onEmail: () => void;
}) {
  const { c } = useTheme();
  return (
    <Card variant="ornate" style={styles.helplineCard}>
      <View style={styles.helplineTop}>
        <View style={[styles.iconMedallion, { backgroundColor: c.accentContainer }]}>
          <Icon name="bell" size={24} color={c.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Type v="titleMd" tone="goldInk">
            {title}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            {hours || (hi ? 'भक्त सहायता' : 'Devotee support')}
          </Type>
        </View>
      </View>

      {/* A channel is offered only when it is configured. An unset one is
          hidden rather than dialling a placeholder somebody else owns. */}
      {hasSupport ? (
        <View style={styles.helplineActions}>
          {!!phone && (
            <Button
              label={hi ? 'कॉल करें' : 'Call Helpline'}
              icon="sparkle"
              size="sm"
              style={{ flex: 1 }}
              onPress={onCall}
            />
          )}
          {!!email && (
            <Button
              label={hi ? 'ईमेल भेजें' : 'Send Email'}
              variant={phone ? 'outline' : 'primary'}
              size="sm"
              style={{ flex: 1 }}
              onPress={onEmail}
            />
          )}
        </View>
      ) : (
        <Type v="bodySm" tone="onSurfaceVariant">
          {hi
            ? 'संपर्क विवरण शीघ्र उपलब्ध होंगे। तब तक नीचे दिए सामान्य प्रश्न देखें।'
            : 'Contact details are not published yet — the FAQs below cover the common questions.'}
        </Type>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  helplineCard: {
    padding: Space.md,
    gap: Space.md,
  },
  helplineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  iconMedallion: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helplineActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
});
