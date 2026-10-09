import { Redirect } from 'expo-router';

/** Old name for My Bookings; kept so existing links and deep links still land. */
export default function MyPoojas() {
  return <Redirect href="/my-bookings" />;
}
