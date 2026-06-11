import { SoloClient } from './SoloClient';

/**
 * Offline / solo "dice cup" mode — no room, no server, no networking. The phone
 * is a fair local dice cup for one person playing 大话骰 face-to-face (everyone
 * calls their bids out loud; the app just rolls + shows your own dice).
 */
export default function SoloPage() {
  return <SoloClient />;
}
