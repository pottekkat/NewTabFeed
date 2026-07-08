import { useSettings } from './lib/use-settings';
import { useTheme } from './lib/use-theme';
import { Onboarding } from './components/Onboarding';
import { MainView } from './components/MainView';

export default function App() {
  const settings = useSettings();
  // Apply the theme as soon as it's known; `null` leaves the class untouched
  // (the inline pre-paint script in main.tsx set a sensible default already).
  useTheme(settings?.theme ?? null);

  // Hold a blank canvas until settings load—a single frame, no visible flash —
  // so we never briefly show onboarding to a returning user or vice versa.
  if (!settings) {
    return <div className="bg-background min-h-screen" />;
  }

  if (!settings.onboardingComplete) {
    // Onboarding persists `onboardingComplete`; the settings watch re-renders us
    // into the main view. `onComplete` is a belt-and-suspenders re-render nudge.
    return <Onboarding onComplete={() => {}} />;
  }

  return <MainView settings={settings} />;
}
