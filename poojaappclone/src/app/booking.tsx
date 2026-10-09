import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * The old temple -> seva -> date flow is gone; booking now starts from a pooja.
 * `/booking?temple=<slug>` (still linked from Home) lands on that temple's poojas.
 */
export default function Booking() {
  const { temple } = useLocalSearchParams<{ temple?: string }>();
  return <Redirect href={{ pathname: '/poojas', params: temple ? { temple } : {} }} />;
}
